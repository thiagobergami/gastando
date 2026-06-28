import path from 'path';

interface ResolveDbPathOpts {
  env?: NodeJS.ProcessEnv;
  isPackaged?: boolean;
  execPath?: string;
  projectRoot?: string;
}

export function resolveDbPath(opts: ResolveDbPathOpts = {}): string {
  const env = opts.env || process.env;
  if (env.DB_PATH) return env.DB_PATH;
  const isPackaged =
    opts.isPackaged !== undefined ? opts.isPackaged : Boolean((process as any).pkg);
  const execPath = opts.execPath || process.execPath;
  // From dist/infra/paths.js (and src/infra/paths.ts under tsx), the project
  // root is two levels up.
  const projectRoot = opts.projectRoot || path.join(__dirname, '..', '..');
  const baseDir = isPackaged ? path.dirname(execPath) : projectRoot;
  return path.join(baseDir, 'data', 'gastando.db');
}
