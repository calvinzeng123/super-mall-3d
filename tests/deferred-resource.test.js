import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredResource, createSerialTaskQueue, detailAssetKind, activeDetailFloor } from '../src/render/deferred-resource.js';

const gate = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('unvisited detail resources do not load; concurrent floor visits share one request', async () => {
  const wait = gate(); let calls = 0;
  const resource = createDeferredResource(() => { calls++; return wait.promise; });
  assert.equal(resource.status, 'idle'); assert.equal(calls, 0);
  const first = resource.request(), second = resource.request();
  assert.equal(first, second); assert.equal(resource.status, 'loading');
  await Promise.resolve(); assert.equal(calls, 1);
  const asset = { templates: 3 }; wait.resolve(asset);
  assert.equal(await first, asset); assert.equal(resource.status, 'ready');
  assert.equal(await resource.request(), asset); assert.equal(calls, 1);
});

test('failed detail downloads remain dormant across visibility refreshes and can explicitly retry', async () => {
  let calls = 0;
  const failure = new Error('network unavailable');
  const resource = createDeferredResource(async () => {
    if (++calls === 1) throw failure;
    return 'loaded';
  });
  await assert.rejects(resource.request(), failure);
  assert.equal(resource.status, 'error'); assert.equal(resource.error, failure);
  await assert.rejects(resource.request(), failure); assert.equal(calls, 1);
  const retry = resource.request({ retry: true });
  assert.equal(resource.status, 'loading'); assert.equal(resource.error, null);
  assert.equal(await retry, 'loaded'); assert.equal(calls, 2);
});

test('suite and residential decode tasks never overlap, including after the first task fails', async () => {
  const schedule = createSerialTaskQueue(), wait = gate();
  const events = [];
  const suite = createDeferredResource(async () => { events.push('suite'); await wait.promise; throw new Error('suite failed'); }, schedule);
  const residential = createDeferredResource(async () => { events.push('residential'); return 'three variants'; }, schedule);
  const first = suite.request(), second = residential.request();
  const rejected = assert.rejects(first, /suite failed/);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(events, ['suite']);
  wait.resolve(); await rejected;
  assert.equal(await second, 'three variants'); assert.deepEqual(events, ['suite', 'residential']);
});

test('lobbies and basements need no interior asset, and the two families remain distinct', () => {
  assert.equal(detailAssetKind({ units: [] }), null);
  assert.equal(detailAssetKind({ units: [{ residence: null }] }), null);
  assert.equal(detailAssetKind({ units: [{ residence: { suitePlan: {} } }] }), 'suite');
  assert.equal(detailAssetKind({ units: [{ residence: { prototype: '03' } }] }), 'residential');
});

test('completion resolves the current detail floor instead of reviving a stale request', async () => {
  const wait = gate(), state = { building: 'H', focus: 'H-2F', explore: null };
  const resource = createDeferredResource(() => wait.promise);
  const created = [];
  const ready = resource.request().then(() => { const id = activeDetailFloor(state); if (id) created.push(id); });
  state.building = 'A'; state.focus = 'A-3F'; wait.resolve({}); await ready;
  assert.deepEqual(created, ['A-3F']);
  state.explore = { level: 'R2-4F' };
  assert.equal(activeDetailFloor(state), 'R2-4F');
  state.explore = null; state.focus = null; state.building = null;
  assert.equal(activeDetailFloor(state), null);
});
