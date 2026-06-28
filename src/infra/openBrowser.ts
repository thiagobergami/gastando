import { spawn } from 'node:child_process';

interface BrowserCommand {
  cmd: string;
  args: string[];
}

export function browserCommand(platform: NodeJS.Platform, url: string): BrowserCommand {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] };
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  return { cmd: 'xdg-open', args: [url] };
}

interface OpenBrowserOpts {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export function openBrowser(url: string, opts: OpenBrowserOpts = {}): boolean {
  const { platform = process.platform, env = process.env } = opts;
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
