// test/smoke.js
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node test/smoke.js <command> [args...]');
  process.exit(2);
}

const PORT = 3998;
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gastando-smoke-'));
const dbPath = path.join(dbDir, 'gastando.db');

const child = spawn(cmd, args, {
  env: { ...process.env, PORT: String(PORT), NO_OPEN: '1', DB_PATH: dbPath },
  stdio: 'inherit',
});

function getStatus(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
}

async function pollReady() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      if (await getStatus(`http://localhost:${PORT}/`) === 200) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  let failed = false;
  if (!await pollReady()) { console.error('SMOKE FAIL: server did not return 200 in time'); failed = true; }
  if (!fs.existsSync(dbPath)) { console.error('SMOKE FAIL: db file was not created'); failed = true; }
  child.kill();
  if (failed) process.exit(1);
  console.log('SMOKE PASS');
  process.exit(0);
})();
