import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBinary } from '../src/render/fetch-binary.js';

const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
function download(responses) {
  const calls = [], delays = [];
  const options = {
    label: '住宅01模型',
    fetchImpl: async url => {
      calls.push(url);
      const result = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (result instanceof Error) throw result;
      return result();
    },
    wait: async ms => { delays.push(ms); },
  };
  return { calls, delays, options };
}
const success = () => new Response(bytes);

test('successful binary download preserves bytes without a retry', async () => {
  const d = download([success]);
  assert.deepEqual(new Uint8Array(await fetchBinary('./assets/model.glb', d.options)), bytes);
  assert.deepEqual(d.calls, ['./assets/model.glb']);
  assert.deepEqual(d.delays, []);
});

test('temporary connection failures retry the same URL with bounded backoff', async () => {
  const d = download([new TypeError('Failed to fetch'), new TypeError('ERR_CONNECTION_RESET'), success]);
  assert.deepEqual(new Uint8Array(await fetchBinary('./assets/model.glb', d.options)), bytes);
  assert.deepEqual(d.calls, Array(3).fill('./assets/model.glb'));
  assert.deepEqual(d.delays, [500, 1000]);
});

test('temporary HTTP failures retry but permanent HTTP responses stop immediately', async () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    const d = download([() => new Response('temporarily unavailable', { status }), success]);
    assert.deepEqual(new Uint8Array(await fetchBinary('/model.bin', d.options)), bytes);
    assert.equal(d.calls.length, 2);
  }
  for (const status of [400, 401, 403, 404, 410, 501]) {
    const d = download([() => new Response('unavailable', { status }), success]);
    await assert.rejects(fetchBinary('/model.bin', d.options), new RegExp(`住宅01模型下载失败：HTTP ${status}`));
    assert.equal(d.calls.length, 1);
    assert.deepEqual(d.delays, []);
  }
});

test('an interrupted response body is downloaded afresh before returning', async () => {
  const interrupted = () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(bytes.subarray(0, 2)); },
    pull(controller) { controller.error(new TypeError('connection reset during response body')); },
  }));
  const d = download([interrupted, success]);
  assert.deepEqual(new Uint8Array(await fetchBinary('/model.glb', d.options)), bytes);
  assert.equal(d.calls.length, 2);
  assert.deepEqual(d.delays, [500]);
});

test('repeated connection and server failures stop after three total attempts', async () => {
  for (const failure of [new TypeError('Network suspended'), () => new Response('', { status: 503 })]) {
    const d = download([failure]);
    await assert.rejects(fetchBinary('/model.glb', d.options), error => {
      assert.match(error.message, /住宅01模型下载失败.*已尝试 3 次.*刷新重试/);
      assert.ok(error.cause instanceof Error);
      return true;
    });
    assert.equal(d.calls.length, 3);
    assert.deepEqual(d.delays, [500, 1000]);
  }
});

test('an explicitly canceled download is not retried', async () => {
  const d = download([new DOMException('Aborted', 'AbortError'), success]);
  await assert.rejects(fetchBinary('/model.glb', d.options), /下载已取消/);
  assert.equal(d.calls.length, 1);
  assert.deepEqual(d.delays, []);
});
