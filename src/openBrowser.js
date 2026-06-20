const { spawn } = require('child_process');

function browserCommand(platform, url) {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] };
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  return { cmd: 'xdg-open', args: [url] };
}

function openBrowser(url, { platform = process.platform, env = process.env } = {}) {
  if (env.NO_OPEN) return false;
  const { cmd, args } = browserCommand(platform, url);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

module.exports = { browserCommand, openBrowser };
