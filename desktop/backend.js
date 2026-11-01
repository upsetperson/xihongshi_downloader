const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { handler } = require('../server');

// Only the main process can access this service. The renderer uses app://library.
async function startBackend() {
  const token = randomBytes(32).toString('hex');
  const server = http.createServer((req, res) => {
    if (req.headers['x-desktop-token'] !== token) {
      res.writeHead(403);
      res.end();
      return;
    }
    return handler(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, token, origin: `http://127.0.0.1:${server.address().port}` };
}

module.exports = { startBackend };
