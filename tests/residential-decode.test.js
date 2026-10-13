import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { decodeResidentialAsset } from '../src/render/residential-asset.js';

function fixture(buffer) {
  if (!buffer) {
    buffer = Buffer.alloc(24);
    buffer.writeUInt32LE(0x46546c67, 0);
    buffer.writeUInt32LE(2, 4);
    buffer.writeUInt32LE(buffer.length, 8);
  }
  const bytes = gzipSync(buffer);
  return { buffer, bytes, record: { unit: '03', compression: 'gzip',
    compressedBytes: bytes.length, modelBytes: buffer.length, url: './assets/residence-03.test.bin' } };
}

test('住宅线上下载拒绝 HTTP 错误、截断数据与非 gzip 响应', async t => {
  const { record, bytes } = fixture();
  const fetch = t.mock.method(globalThis, 'fetch');
  fetch.mock.mockImplementation(async () => new Response('Not found', { status: 404 }));
  await assert.rejects(decodeResidentialAsset(record), /HTTP 404/);
  fetch.mock.mockImplementation(async () => new Response(bytes.subarray(0, -2)));
  await assert.rejects(decodeResidentialAsset(record), /压缩数据校验失败/);
  fetch.mock.mockImplementation(async () => new Response(Buffer.alloc(bytes.length)));
  await assert.rejects(decodeResidentialAsset(record), /压缩数据校验失败/);
});

test('住宅线上下载拒绝错误的 GLB 长度、版本和头部', async t => {
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const invalid of [Buffer.alloc(4), Buffer.alloc(24), (() => {
    const buffer = fixture().buffer; buffer.writeUInt32LE(1, 4); return buffer;
  })(), (() => {
    const buffer = fixture().buffer; buffer.writeUInt32LE(100, 8); return buffer;
  })()]) {
    const { record, bytes } = fixture(invalid);
    fetch.mock.mockImplementation(async () => new Response(bytes));
    await assert.rejects(decodeResidentialAsset(record), /模型解压校验失败/);
  }
});

test('离线住宅数据不发请求，并与同一线上 gzip 解压出相同 GLB', async t => {
  const { record, bytes, buffer } = fixture();
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline must not fetch'); });
  const { url, ...offline } = record;
  const decodedOffline = await decodeResidentialAsset({ ...offline, data: bytes.toString('base64') });
  assert.deepEqual(Buffer.from(decodedOffline), buffer);
  assert.equal(fetch.mock.callCount(), 0);
  fetch.mock.mockImplementation(async input => {
    assert.equal(input, record.url); return new Response(bytes);
  });
  const decodedOnline = await decodeResidentialAsset(record);
  assert.deepEqual(Buffer.from(decodedOnline), Buffer.from(decodedOffline));
  assert.equal(fetch.mock.callCount(), 1);
});

test('三套真实住宅在线 gzip 传输保留原始 GLB 每个字节', async t => {
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const unit of ['01', '02', '03']) {
    const plan = JSON.parse(await readFile(new URL(`../scripts/residential/plan_${unit}.json`, import.meta.url)));
    const basename = plan.model_basename || `云澜汇_${unit}${unit === '03' ? '四' : '三'}房两厅`;
    const buffer = await readFile(new URL(`../prototypes/residential${unit}/${basename}.glb`, import.meta.url));
    const { record, bytes } = fixture(buffer);
    fetch.mock.mockImplementation(async () => new Response(bytes));
    assert.deepEqual(Buffer.from(await decodeResidentialAsset({ ...record, unit })), buffer);
  }
});
