const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const cheerio = require('cheerio');
const { NovelDecoder } = require('./decoder');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ORIGIN = 'https://fanqienovel.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const decoder = new NovelDecoder();
const publicDir = path.join(__dirname, 'public');

async function request(url, json = false, cookie = '') {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: ORIGIN + '/', ...(cookie ? { Cookie: cookie } : {}) },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`上游请求失败：HTTP ${response.status}`);
  return json ? response.json() : response.text();
}

function decoded(value) { return decoder.smartDecode(String(value || '')); }
function assertId(id) {
  if (!/^\d{10,25}$/.test(id || '')) throw new Error('无效的书籍或章节 ID');
  return id;
}
function assertPage(value) {
  const page = Number(value || 1);
  if (!Number.isInteger(page) || page < 1 || page > 500) throw new Error('页码需在 1 到 500 之间');
  return page;
}
function textOf($, selector) { return decoded($(selector).first().text().trim()); }

async function categories() {
  const result = await request(`${ORIGIN}/api/author/book/category_list/v0/`, true);
  if (!Array.isArray(result.data)) throw new Error('分类数据格式已变化');
  const groups = new Map();
  for (const item of result.data) {
    const group = item.label || '其他';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ id: String(item.category_id), name: item.name, icon: item.cover_uri || '' });
  }
  return [...groups].map(([name, items]) => ({ name, items }));
}

function allowed(value, options, name) {
  if (!options.includes(String(value))) throw new Error(`无效的${name}`);
  return String(value);
}

async function books(categoryId, page, filters = {}, cookie = '') {
  if (categoryId !== '-1') assertIdCategory(categoryId);
  const url = new URL(`${ORIGIN}/api/author/library/book_list/v0/`);
  Object.entries({ page_count: '18', page_index: String(page - 1), gender: allowed(filters.gender ?? '-1', ['-1','0','1'], '读者类型'), category_id: categoryId, creation_status: allowed(filters.status ?? '-1', ['-1','0','1'], '连载状态'), word_count: allowed(filters.words ?? '-1', ['-1','0','1','2','3','4'], '字数范围'), book_type: '-1', sort: allowed(filters.sort ?? '0', ['0','1','2'], '排序方式') })
    .forEach(([key, value]) => url.searchParams.set(key, value));
  const result = await request(url, true, cookie);
  if (!Array.isArray(result.data?.book_list)) throw new Error('书籍列表格式已变化');
  return { hasMore: Boolean(result.data.has_more), total: result.data.total_count, items: result.data.book_list.map(item => ({
    id: String(item.book_id), title: decoded(item.book_name), author: decoded(item.author),
    summary: decoded(item.abstract), cover: item.thumb_url || (item.thumb_uri ? `https://p6-novel.byteimg.com/large/${item.thumb_uri}` : ''),
    status: Number(item.creation_status) === 0 ? '已完结' : '连载中', words: decoded(item.word_count), updated: item.last_chapter_time || ''
  })) };
}

function assertIdCategory(id) { if (!/^\d{1,10}$/.test(id || '')) throw new Error('无效的分类 ID'); }

async function search(query, page) {
  if (!query || query.length > 80) throw new Error('搜索词长度需在 1 到 80 字之间');
  const url = new URL('https://api-lf.fanqiesdk.com/api/novel/channel/homepage/search/search/v1/');
  Object.entries({ offset: String((page - 1) * 10), aid: '1967', q: query }).forEach(([key, value]) => url.searchParams.set(key, value));
  const result = await request(url, true);
  const items = result.data?.ret_data;
  if (!Array.isArray(items)) throw new Error('搜索结果格式已变化');
  return { hasMore: Boolean(result.data.has_more), items: items.map(item => {
    const book = item.book_data?.[0] || item;
    return { id: String(book.book_id || book.id || ''), title: decoded(book.book_name || book.title), author: decoded(book.author), summary: decoded(book.abstract || book.description), cover: book.thumb_url || book.cover_url || '' };
  }).filter(item => /^\d{10,25}$/.test(item.id)) };
}

async function detail(id, cookie = '') {
  assertId(id);
  const html = await request(`${ORIGIN}/page/${id}`, false, cookie);
  const $ = cheerio.load(html);
  const chapters = [];
  $('.chapter-item').each((_, element) => {
    const anchor = $(element).find('a[href*="/reader/"]').first();
    const href = anchor.attr('href') || $(element).find('.chapter-item-title').attr('href') || '';
    const match = href.match(/\/reader\/(\d+)/);
    if (match) chapters.push({ id: match[1], title: decoded(anchor.text().trim() || $(element).text().trim()) });
  });
  const title = textOf($, '.info-name h1');
  if (!title || !chapters.length) throw new Error('书籍详情或目录解析失败，网站结构可能已变化');
  return {
    id, title, author: textOf($, '.author-name-text'),
    cover: $('.book-cover-img').first().attr('src') || '',
    summary: textOf($, '.page-abstract-content p'),
    latest: textOf($, '.info-last-title'), chapters
  };
}

async function chapter(id, cookie = '') {
  assertId(id);
  const html = await request(`${ORIGIN}/reader/${id}`, false, cookie);
  const $ = cheerio.load(html);
  let raw = '';
  let title = textOf($, 'h1.muye-reader-title');
  const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (match) {
    try {
      const state = JSON.parse(match[1].replace(/:\s*undefined/g, ':null'));
      raw = state.reader?.chapterData?.content || '';
      title = decoded(state.reader?.chapterData?.title) || title;
    } catch { /* 继续尝试页面正文 */ }
  }
  if (!raw) raw = $('.muye-reader-content').first().html() || '';
  if (!raw) throw new Error('章节正文解析失败，可能需要登录或该章节不可访问');
  const body = cheerio.load(`<main>${raw}</main>`);
  body('br').replaceWith('\n');
  body('p').each((_, element) => body(element).append('\n\n'));
  const content = decoded(body('main').text()).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!content) throw new Error('章节内容为空');
  return { id, title, content };
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: '只支持 GET 请求' });
  try {
    const url = new URL(req.url, 'http://localhost');
    const segments = url.pathname.split('/').filter(Boolean);
    const cookie = req.headers['x-fanqie-cookie'] || '';
    if (typeof cookie !== 'string' || cookie.length > 8192 || /[\r\n\x00-\x1f]/.test(cookie)) throw new Error('无效的 Cookie');
    if (url.pathname === '/api/categories') return sendJson(res, 200, await categories());
    if (url.pathname === '/api/books') return sendJson(res, 200, await books(url.searchParams.get('category') || '-1', assertPage(url.searchParams.get('page')), { gender: url.searchParams.get('gender') ?? '-1', status: url.searchParams.get('status') ?? '-1', words: url.searchParams.get('words') ?? '-1', sort: url.searchParams.get('sort') ?? '0' }, cookie));
    if (url.pathname === '/api/search') return sendJson(res, 200, await search((url.searchParams.get('q') || '').trim(), assertPage(url.searchParams.get('page'))));
    if (segments[0] === 'api' && segments[1] === 'books' && segments.length === 3) return sendJson(res, 200, await detail(segments[2], cookie));
    if (segments[0] === 'api' && segments[1] === 'chapters' && segments.length === 3) return sendJson(res, 200, await chapter(segments[2], cookie));
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html', 'app.js', 'style.css'].includes(file)) return sendJson(res, 404, { error: '页面不存在' });
    const types = { 'index.html': 'text/html', 'app.js': 'text/javascript', 'style.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': `${types[file]}; charset=utf-8` });
    fs.createReadStream(path.join(publicDir, file)).pipe(res);
  } catch (error) {
    const invalid = /无效|需在|长度需/.test(error.message);
    sendJson(res, invalid ? 400 : 502, { error: error.message });
  }
}

if (require.main === module) http.createServer(handler).listen(PORT, HOST, () => console.log(`打开 http://${HOST}:${PORT}`));
module.exports = { categories, books, search, detail, chapter, handler };
