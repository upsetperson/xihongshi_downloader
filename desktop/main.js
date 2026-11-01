const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, net, protocol } = require('electron');
const { startBackend } = require('./backend');

const APP_URL = 'app://library/';
// Keep the same settings directory in development, installed and portable builds.
app.setName('xihongshi-downloader');
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

let mainWindow;
let backend;

async function startDesktop() {
  await app.whenReady();
  backend = await startBackend();
  protocol.handle('app', request => {
    const url = new URL(request.url);
    if (url.host !== 'library' || request.method !== 'GET') return new Response('', { status: 403 });
    return net.fetch(`${backend.origin}${url.pathname}${url.search}`, {
      headers: {
        'X-Desktop-Token': backend.token,
        'X-Fanqie-Cookie': request.headers.get('X-Fanqie-Cookie') || ''
      }
    });
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [{ role: 'quit', label: '退出' }] },
    { label: '编辑', submenu: [
      { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
    ] },
    { label: '视图', submenu: [
      { role: 'reload', label: '重新加载' }, { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' },
      { role: 'togglefullscreen', label: '全屏' }
    ] }
  ]));
  app.on('activate', () => { if (!mainWindow) createWindow(); });
  return createWindow();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 1000, minHeight: 700,
    title: '番茄小说下载器', backgroundColor: '#f7f8fa', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { mainWindow = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== APP_URL) event.preventDefault();
  });
  const session = win.webContents.session;
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  // Register once per session, even when a window is recreated.
  if (!session.desktopDownloadsConfigured) {
    session.desktopDownloadsConfigured = true;
    session.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({
        title: '保存小说 TXT',
        defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())),
        filters: [{ name: 'TXT 文本', extensions: ['txt'] }]
      });
      item.once('done', (_event, state) => {
        if (state === 'interrupted') dialog.showErrorBox('保存失败', '文件未能保存，请检查目标位置的空间和写入权限后重试。');
      });
    });
  }
  win.loadURL(APP_URL).catch(error => {
    dialog.showErrorBox('页面加载失败', error.message);
    app.quit();
  });
  return win;
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  backend?.server.close();
  backend?.server.closeAllConnections();
});

if (require.main === module) {
  app.setPath('userData', path.join(app.getPath('appData'), 'xihongshi-downloader'));
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
    startDesktop().catch(error => {
      dialog.showErrorBox('客户端启动失败', error.message);
      app.quit();
    });
  }
}

module.exports = { startDesktop };
