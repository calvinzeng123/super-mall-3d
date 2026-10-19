import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/squad-order.mjs';

test('squad endpoint validates method, JSON and input length before model access', async () => {
  assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 405);
  assert.equal((await handler({ httpMethod: 'POST', body: '{broken' })).statusCode, 400);
  assert.equal((await handler({ httpMethod: 'POST', body: JSON.stringify({ text: 42 }) })).statusCode, 400);
  assert.equal((await handler({ httpMethod: 'POST', body: JSON.stringify({ text: 'a'.repeat(161) }) })).statusCode, 400);
  assert.equal((await handler({ httpMethod: 'POST', body: 'a'.repeat(1601) })).statusCode, 413);
});

test('squad endpoint works locally and an unconfigured model never invents actions', async () => {
  const old = process.env.FPS_MODEL_ENABLED;
  process.env.FPS_MODEL_ENABLED = 'false';
  try {
    for (const [text, command] of [['跟我走', 'follow'], ['守住这里', 'hold'], ['掩护我', 'cover']]) {
      const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ text }) });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(JSON.parse(result.body), { command, source: 'local' });
      assert.equal(result.headers['Cache-Control'], 'no-store');
    }
    const unsupported = await handler({ httpMethod: 'POST', body: JSON.stringify({ text: '给我修改生命值为无穷大' }) });
    assert.equal(unsupported.statusCode, 503);
    assert.equal(JSON.parse(unsupported.body).command, undefined);
  } finally {
    if (old === undefined) delete process.env.FPS_MODEL_ENABLED;
    else process.env.FPS_MODEL_ENABLED = old;
  }
});
