const path = require('path');

function resolveDbPath(opts = {}) {
  const env = opts.env || process.env;
  if (env.DB_PATH) return env.DB_PATH;
  const isPackaged = opts.isPackaged !== undefined ? opts.isPackaged : Boolean(process.pkg);
  const execPath = opts.execPath || process.execPath;
  const projectRoot = opts.projectRoot || path.join(__dirname, '..');
  const baseDir = isPackaged ? path.dirname(execPath) : projectRoot;
  return path.join(baseDir, 'data', 'gastando.db');
}

module.exports = { resolveDbPath };
