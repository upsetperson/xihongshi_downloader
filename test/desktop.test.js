const test = require('node:test');
const assert = require('node:assert/strict');
const { startBackend } = require('../desktop/backend');

test('桌面服务选择空闲端口，拒绝未授权请求', async () => {
  const first = await startBackend();
  const second = await startBackend();
  try {
    assert.notEqual(first.origin, second.origin);
    assert.equal((await fetch(first.origin)).status, 403);
    assert.equal((await fetch(first.origin, { headers: { 'X-Desktop-Token': second.token } })).status, 403);
    const headers = { 'X-Desktop-Token': first.token };
    const page = await fetch(first.origin, { headers });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /番茄小说下载器/);
    assert.equal((await fetch(`${first.origin}/api/books/not-an-id`, { headers })).status, 400);
    assert.equal((await fetch(`${first.origin}/../package.json`, { headers })).status, 404);
  } finally {
    await Promise.all([first, second].map(({ server }) => new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    })));
  }
});
