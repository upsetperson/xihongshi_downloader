const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { NovelDecoder } = require('../decoder');
const { handler, chapter } = require('../server');

test('解码表可以还原样本书名与简介', () => {
  const decoder = new NovelDecoder();
  assert.equal(decoder.smartDecode(''), '神通者');
  assert.equal(decoder.smartDecode('灵，异骨'), '世间生灵，体生异骨');
  assert.equal(decoder.smartDecode('普通文字'), '普通文字');
});

test('本地服务提供页面并拒绝无效 ID', async () => {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /番茄小说下载器/);
    const invalid = await fetch(`${base}/api/books/not-an-id`);
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /无效/);
    assert.equal((await fetch(`${base}/unknown`)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('章节请求将选中的 Cookie 传给上游', async () => {
  const originalFetch = global.fetch;
  let received;
  global.fetch = async (url, options) => {
    received = { url, cookie: options.headers.Cookie };
    return new Response('<div class="muye-reader-content"><p>测试正文</p></div>', { status: 200 });
  };
  try {
    const result = await chapter('7188894798512652852', 'sessionid=test-value');
    assert.equal(received.cookie, 'sessionid=test-value');
    assert.match(received.url, /fanqienovel\.com\/reader\//);
    assert.equal(result.content, '测试正文');
  } finally { global.fetch = originalFetch; }
});
