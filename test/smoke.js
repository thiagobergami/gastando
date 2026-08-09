// test/smoke.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

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

let ready = false;
let done = false;

child.on('error', (err) => {
  console.error(`SMOKE FAIL: failed to spawn (${err.message})`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (!ready && !done) {
    console.error(`SMOKE FAIL: process exited early (code=${code} signal=${signal})`);
    process.exit(1);
  }
});

function getStatus(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

async function pollReady() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (done) return false; // early-exit handler already fired
    try {
      if ((await getStatus(`http://localhost:${PORT}/`)) === 200) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  let failed = false;
  if (!(await pollReady())) {
    console.error('SMOKE FAIL: server did not return 200 in time');
    failed = true;
  }
  if (!fs.existsSync(dbPath)) {
    console.error('SMOKE FAIL: db file was not created');
    failed = true;
  }
  // The schema has to have been created INSIDE the packaged binary. `/` and the
  // file's existence pass with an empty database; `/api/categories` only
  // answers 8 if the 001→007 chain ran from the pkg snapshot.
  try {
    const cats = await getJson(`http://localhost:${PORT}/api/categories`);
    if (!Array.isArray(cats) || cats.length !== 8) {
      console.error(
        `SMOKE FAIL: expected the 8 seeded categories, got ${
          Array.isArray(cats) ? cats.length : typeof cats
        } — migrations did not run inside the packaged binary`,
      );
      failed = true;
    }
  } catch (e) {
    console.error(`SMOKE FAIL: /api/categories did not answer (${e.message})`);
    failed = true;
  }
  ready = true; // mark ready before kill so exit handler ignores normal shutdown
  done = true;
  child.kill();
  if (failed) process.exit(1);
  console.log('SMOKE PASS');
  process.exit(0);
})();
