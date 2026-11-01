const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xihongshi-smoke-'));
const env = { ...process.env, DESKTOP_SMOKE_DIR: tempDir };
delete env.ELECTRON_RUN_AS_NODE;

try {
  for (const phase of ['write', 'read']) {
    const result = spawnSync(require('electron'), [path.join(__dirname, 'smoke-runtime.js'), phase], {
      env, encoding: 'utf8', timeout: 45000, windowsHide: true
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Desktop smoke test failed: ${phase} (${result.status})`);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
