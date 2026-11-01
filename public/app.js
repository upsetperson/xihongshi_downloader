const $ = selector => document.querySelector(selector);
const state = { category: '1317', categoryName: '古言权谋', group: '主题', groups: [], gender: '0', status: '0', words: '1', sort: '0', query: '', page: 1, books: [], detail: null, chapterIndex: 0, listToken: 0, downloading: false };
const elements = { grid: $('#bookGrid'), message: $('#listMessage'), detail: $('#detailContent'), reader: $('#readerBody') };
const COOKIE_KEY = 'fanqie.cookies.v1';
let cookieCursor = 0;
function configuredCookies() {
  try { const value = JSON.parse(localStorage.getItem(COOKIE_KEY) || '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : []; }
  catch { return []; }
}
function nextCookie() {
  const cookies = configuredCookies();
  return cookies.length ? cookies[cookieCursor++ % cookies.length] : '';
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}
function toast(message) {
  const node = $('#toast'); node.textContent = message; node.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.hidden = true, 4500);
}
async function api(path, authenticated = false) {
  const cookie = authenticated ? nextCookie() : '';
  const response = await fetch(path, { headers: cookie ? { 'X-Fanqie-Cookie': cookie } : {} });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}
function cover(src, className = 'cover') {
  const image = el('img', className); image.alt = '书籍封面'; image.loading = 'lazy';
  if (src && /^https?:\/\//.test(src)) image.src = src;
  image.onerror = () => { image.removeAttribute('src'); image.alt = '暂无封面'; };
  return image;
}
function updateNav() {
  document.querySelectorAll('.side-item').forEach(node => node.classList.toggle('active', !state.query && node.dataset.category === state.category));
}
async function loadCategories() {
  try {
    const groups = await api('/api/categories');
    state.groups = groups;
    const box = $('#categories'); box.replaceChildren();
    for (const group of groups) {
      const section = el('div', 'category-group');
      const heading = el('button', 'group-title', `${group.name} ${group.name === state.group ? '▴' : '▾'}`);
      heading.type = 'button'; heading.setAttribute('aria-expanded', String(group.name === state.group));
      const items = el('div', 'group-items'); items.hidden = group.name !== state.group;
      heading.addEventListener('click', () => { items.hidden = !items.hidden; heading.setAttribute('aria-expanded', String(!items.hidden)); heading.textContent = `${group.name} ${items.hidden ? '▾' : '▴'}`; });
      section.append(heading, items); box.append(section);
      for (const item of group.items) {
        const button = el('button', 'side-item', item.name);
        button.type = 'button'; button.dataset.category = item.id;
        button.addEventListener('click', () => chooseCategory(item.id, item.name));
        items.append(button);
      }
    }
    renderFilters(); updateNav();
  } catch (error) { toast(`分类加载失败：${error.message}`); }
}
function chooseCategory(id, name) {
  state.category = id; state.categoryName = name; state.query = ''; state.page = 1;
  const group = state.groups.find(group => group.items.some(item => item.id === id));
  if (group) state.group = group.name;
  $('#searchInput').value = ''; updateNav(); renderFilters(); showListing(); loadBooks();
}
function filterButtons(selector, options, selected, onSelect) {
  const container = $(selector); container.replaceChildren();
  for (const option of options) {
    const button = el('button', option.value === selected ? 'filter-chip selected' : 'filter-chip', option.label);
    button.type = 'button'; button.setAttribute('aria-pressed', String(option.value === selected));
    if (option.icon && /^https?:\/\//.test(option.icon)) { const icon = cover(option.icon, 'category-icon'); button.prepend(icon); }
    button.addEventListener('click', () => onSelect(option.value, option.label)); container.append(button);
  }
}
function setFilter(key, value) { state[key] = value; state.page = 1; renderFilters(); loadBooks(); }
function renderFilters() {
  filterButtons('#genderOptions', [{value:'-1',label:'全部'},{value:'1',label:'男生'},{value:'0',label:'女生'}], state.gender, value => setFilter('gender', value));
  filterButtons('#groupOptions', [{value:'',label:'全部'}, ...state.groups.map(group => ({value:group.name,label:group.name}))], state.group, value => { state.group = value; state.category = '-1'; state.categoryName = '全部书籍'; state.page = 1; updateNav(); renderFilters(); loadBooks(); });
  const groups = state.group ? state.groups.filter(group => group.name === state.group) : state.groups;
  filterButtons('#categoryOptions', groups.flatMap(group => group.items.map(item => ({value:item.id,label:item.name,icon:item.icon}))), state.category, (value, label) => chooseCategory(value, label));
  filterButtons('#statusOptions', [{value:'-1',label:'全部'},{value:'0',label:'已完结'},{value:'1',label:'连载中'}], state.status, value => setFilter('status', value));
  filterButtons('#wordOptions', [{value:'-1',label:'全部'},{value:'0',label:'30万以下'},{value:'1',label:'30-50万'},{value:'2',label:'50-100万'},{value:'3',label:'100-200万'},{value:'4',label:'200万以上'}], state.words, value => setFilter('words', value));
  filterButtons('#sortOptions', [{value:'0',label:'最热'},{value:'1',label:'最新'},{value:'2',label:'字数'}], state.sort, value => setFilter('sort', value));
}
function showListing() { $('#detailView').hidden = true; $('#listingView').hidden = false; }
function setMessage(message) { elements.message.textContent = message; elements.message.hidden = !message; }
async function loadBooks() {
  const token = ++state.listToken;
  elements.grid.replaceChildren(); setMessage('正在加载书籍…');
  $('#listTitle').textContent = state.query ? `搜索“${state.query}”` : state.category === '-1' ? '发现下一本好书' : state.categoryName;
  $('#sectionHeading').textContent = state.query ? '搜索结果' : state.categoryName;
  $('#listSubtitle').textContent = state.query ? '找到感兴趣的作品，点开即可查看目录。' : '浏览分类、搜索故事，随时开始阅读。';
  $('#pageLabel').textContent = `第 ${state.page} 页`;
  $('#prevPage').disabled = state.page === 1;
  $('#libraryFilters').hidden = Boolean(state.query); $('#sortOptions').hidden = Boolean(state.query);
  try {
    const result = state.query
      ? await api(`/api/search?q=${encodeURIComponent(state.query)}&page=${state.page}`)
      : await api(`/api/books?category=${encodeURIComponent(state.category)}&page=${state.page}&gender=${state.gender}&status=${state.status}&words=${state.words}&sort=${state.sort}`, true);
    if (token !== state.listToken) return;
    const items = result.items;
    state.books = items; elements.grid.replaceChildren();
    $('#listCount').textContent = state.query ? `本页 ${items.length} 本` : `共 ${result.total ?? '—'} 本`;
    $('#nextPage').disabled = !result.hasMore;
    setMessage(items.length ? '' : '这一页没有书籍，试试其他分类或关键词。');
    for (const book of items) {
      const button = el('button', 'book-card'); button.type = 'button';
      button.append(cover(book.cover));
      const info = el('div', 'book-info');
      info.append(el('h3', '', book.title || '未知书名'), el('div', 'author', `作者：${book.author || '未知作者'}`));
      if (book.status || book.words) info.append(el('div', 'book-meta', `${book.status || ''} · ${book.words || ''}`));
      info.append(el('p', 'summary', book.summary || '点击查看作品详情'));
      if (book.updated) info.append(el('div', 'book-date', book.updated));
      button.append(info); button.addEventListener('click', () => openBook(book.id)); elements.grid.append(button);
    }
  } catch (error) { if (token === state.listToken) { setMessage(`加载失败：${error.message}`); $('#nextPage').disabled = true; } }
}
async function openBook(id) {
  $('#detailView').hidden = false; $('#listingView').hidden = true;
  elements.detail.replaceChildren(el('div', 'message', '正在加载作品详情…'));
  try { state.detail = await api(`/api/books/${id}`, true); renderDetail(); }
  catch (error) { elements.detail.replaceChildren(el('div', 'message', `加载失败：${error.message}`)); }
}
function renderDetail() {
  const book = state.detail; elements.detail.replaceChildren();
  const top = el('div', 'detail-top'); top.append(cover(book.cover, 'detail-cover'));
  const info = el('div', 'detail-main'); info.append(el('h1', '', book.title));
  info.append(el('div', 'detail-meta', `作者：${book.author || '未知'} · ${book.chapters.length} 章`));
  if (book.latest) info.append(el('div', 'detail-meta', book.latest));
  info.append(el('p', 'detail-summary', book.summary || '暂无简介'));
  const actions = el('div', 'detail-actions');
  const read = el('button', 'primary', '开始阅读'); read.type = 'button'; read.addEventListener('click', () => openChapter(0)); actions.append(read);
  const range = el('div', 'download-range'); range.append(el('span', '', '下载范围'));
  const start = el('input'); start.type = 'number'; start.min = '1'; start.max = String(book.chapters.length); start.value = '1'; start.setAttribute('aria-label', '起始章节');
  const end = el('input'); end.type = 'number'; end.min = '1'; end.max = String(book.chapters.length); end.value = String(book.chapters.length); end.setAttribute('aria-label', '结束章节');
  range.append(start, el('span', '', '至'), end); actions.append(range);
  const download = el('button', 'secondary', '下载 TXT'); download.type = 'button'; actions.append(download);
  const cancel = el('button', 'secondary', '取消下载'); cancel.type = 'button'; cancel.hidden = true; actions.append(cancel);
  const status = el('div', 'download-status');
  let controller;
  cancel.addEventListener('click', () => controller?.abort());
  download.addEventListener('click', async () => {
    if (state.downloading) return;
    const first = Number(start.value), last = Number(end.value);
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last > book.chapters.length || first > last) return toast('请输入有效的章节范围');
    state.downloading = true; controller = new AbortController(); download.disabled = true; cancel.hidden = false;
    const parts = [`${book.title}\n作者：${book.author}\n\n`]; const failures = [];
    for (let index = first - 1; index < last; index++) {
      if (controller.signal.aborted) break;
      status.textContent = `正在下载第 ${index + 1}/${last} 章：${book.chapters[index].title}`;
      try {
        const cookie = nextCookie();
        const response = await fetch(`/api/chapters/${book.chapters[index].id}`, { signal: controller.signal, headers: cookie ? { 'X-Fanqie-Cookie': cookie } : {} });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '下载失败');
        parts.push(`${book.chapters[index].title}\n\n${result.content}\n\n`);
      } catch (error) { if (controller.signal.aborted) break; failures.push(`${index + 1}. ${book.chapters[index].title}: ${error.message}`); }
    }
    if (controller.signal.aborted) { status.textContent = '下载已取消'; }
    else if (parts.length === 1) { status.textContent = '所有章节均下载失败，请稍后重试'; }
    else {
      if (failures.length) parts.push(`\n下载失败的章节：\n${failures.join('\n')}\n`);
      const blob = new Blob(parts, { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
      link.download = `${book.title.replace(/[\\/:*?"<>|]/g, '_')}_${first}-${last}.txt`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 60000);
      status.textContent = `完成：${parts.length - 1 - Number(failures.length > 0)} 章成功${failures.length ? `，${failures.length} 章失败（已写入文件末尾）` : ''}`;
    }
    state.downloading = false; download.disabled = false; cancel.hidden = true;
  });
  info.append(actions, status); top.append(info); elements.detail.append(top);
  const heading = el('div', 'chapter-heading'); heading.append(el('h2', '', '章节目录'), el('span', '', `共 ${book.chapters.length} 章`)); elements.detail.append(heading);
  const list = el('div', 'chapter-list');
  book.chapters.forEach((chapter, index) => {
    const button = el('button', 'chapter-link', chapter.title || `第 ${index + 1} 章`);
    button.type = 'button'; button.addEventListener('click', () => openChapter(index)); list.append(button);
  });
  elements.detail.append(list);
}
async function openChapter(index) {
  if (!state.detail || index < 0 || index >= state.detail.chapters.length) return;
  state.chapterIndex = index; $('#readerOverlay').hidden = false; document.body.style.overflow = 'hidden';
  $('#readerPosition').textContent = `${index + 1} / ${state.detail.chapters.length}`;
  $('#prevChapter').disabled = index === 0; $('#nextChapter').disabled = index === state.detail.chapters.length - 1;
  elements.reader.replaceChildren(el('div', 'message', '正在加载章节…'));
  try {
    const chapter = await api(`/api/chapters/${state.detail.chapters[index].id}`, true);
    if (index !== state.chapterIndex) return;
    elements.reader.replaceChildren(el('h1', '', chapter.title || state.detail.chapters[index].title), el('div', '', chapter.content));
    elements.reader.scrollTop = 0;
  } catch (error) { elements.reader.replaceChildren(el('div', 'message', `章节加载失败：${error.message}`)); }
}
$('#allBooks').dataset.category = '-1';
$('#allBooks').addEventListener('click', () => chooseCategory('-1', '全部书籍'));
$('#searchForm').addEventListener('submit', event => {
  event.preventDefault(); const query = $('#searchInput').value.trim(); if (!query) return toast('请输入书名或作者');
  state.query = query; state.page = 1; updateNav(); showListing(); loadBooks();
});
$('#prevPage').addEventListener('click', () => { if (state.page > 1) { state.page--; loadBooks(); window.scrollTo(0, 0); } });
$('#nextPage').addEventListener('click', () => { state.page++; loadBooks(); window.scrollTo(0, 0); });
$('#backButton').addEventListener('click', showListing);
$('#closeReader').addEventListener('click', () => { $('#readerOverlay').hidden = true; document.body.style.overflow = ''; });
$('#prevChapter').addEventListener('click', () => openChapter(state.chapterIndex - 1));
$('#nextChapter').addEventListener('click', () => openChapter(state.chapterIndex + 1));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#readerOverlay').hidden) $('#closeReader').click(); });
function closeCookieSettings() { $('#cookieOverlay').hidden = true; }
$('#cookieSettings').addEventListener('click', () => {
  $('#cookieInput').value = configuredCookies().join('\n');
  $('#cookieCount').textContent = `已保存 ${configuredCookies().length} 个 Cookie`;
  $('#cookieOverlay').hidden = false;
});
$('#closeCookieSettings').addEventListener('click', closeCookieSettings);
$('#saveCookies').addEventListener('click', () => {
  const cookies = $('#cookieInput').value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  if (cookies.some(item => item.length > 8192 || !item.includes('='))) return toast('每行需填写完整 Cookie，且长度不超过 8192 字符');
  localStorage.setItem(COOKIE_KEY, JSON.stringify(cookies)); cookieCursor = 0;
  closeCookieSettings(); toast(`已保存 ${cookies.length} 个 Cookie`);
});
$('#clearCookies').addEventListener('click', () => { localStorage.removeItem(COOKIE_KEY); cookieCursor = 0; $('#cookieInput').value = ''; $('#cookieCount').textContent = '已保存 0 个 Cookie'; toast('Cookie 已清空'); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#cookieOverlay').hidden) closeCookieSettings(); });
loadCategories(); loadBooks();
