const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const tempDir = process.env.DESKTOP_SMOKE_DIR;
app.setPath('userData', path.join(tempDir, 'profile'));
const { startDesktop } = require('../desktop/main');

(async () => {
  const win = await startDesktop();
  await new Promise((resolve, reject) => {
    win.webContents.once('did-finish-load', resolve);
    win.webContents.once('did-fail-load', (_event, code, message) => reject(new Error(`${code}: ${message}`)));
  });
  const prefs = win.webContents.getLastWebPreferences();
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  assert.equal(await win.webContents.executeJavaScript('document.title'), '番茄小说下载器');
  assert.equal(await win.webContents.executeJavaScript('typeof require'), 'undefined');
  assert.equal(await win.webContents.executeJavaScript("fetch('/api/books/not-an-id').then(r => r.status)"), 400);
  if (process.argv[2] === 'write') {
    await win.webContents.executeJavaScript(`
      document.querySelector('#cookieSettings').click();
      document.querySelector('#cookieInput').value = 'sessionid=desktop-smoke';
      document.querySelector('#saveCookies').click();
      localStorage.setItem('fanqie.reader.v1', JSON.stringify({theme: 'dark', fontSize: 20, lineHeight: 2, width: 760}));
    `);
    const downloadPath = path.join(tempDir, 'smoke.txt');
    const completed = new Promise((resolve, reject) => {
      win.webContents.session.once('will-download', (_event, item) => {
        assert.equal(item.getSaveDialogOptions().title, '保存小说 TXT');
        item.setSavePath(downloadPath);
        item.once('done', (_doneEvent, state) => state === 'completed' ? resolve() : reject(new Error(state)));
      });
    });
    await win.webContents.executeJavaScript(`
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(['桌面下载验证'], {type: 'text/plain;charset=utf-8'}));
      link.download = 'smoke.txt'; document.body.append(link); link.click(); link.remove();
    `);
    await completed;
    assert.equal(fs.readFileSync(downloadPath, 'utf8'), '桌面下载验证');
    await win.webContents.session.flushStorageData();
  } else {
    assert.equal(await win.webContents.executeJavaScript("localStorage.getItem('fanqie.cookies.v1')"), '["sessionid=desktop-smoke"]');
    await win.webContents.executeJavaScript('applyReaderPreferences()');
    assert.equal(await win.webContents.executeJavaScript("document.querySelector('.reader').dataset.theme"), 'dark');
  }
  console.log(`Desktop smoke passed: ${process.argv[2]}`);
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
