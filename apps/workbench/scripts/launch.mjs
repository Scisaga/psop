import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { appRoot } from './dkp.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };

function run(executable, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd: appRoot, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Process stopped with code ${code}: ${path.basename(executable)}`)));
  });
}

try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node.js 22.12 or later is required.');
  try { await access(path.join(appRoot, 'node_modules/vite/bin/vite.js')); }
  catch {
    if (process.platform === 'win32') await run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm.cmd', 'ci']);
    else await run('npm', ['ci']);
  }
  await run(process.env.PSOP_PYTHON || 'python', ['-B', 'scripts/prepare_workspace.py']);
  await run(process.execPath, ['node_modules/typescript/bin/tsc', '-b']);
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  await run(process.execPath, ['scripts/serve.mjs', '--bind', option('--bind', '127.0.0.1'), '--port', option('--port', '8780'),
    ...(args.includes('--no-browser') ? [] : ['--open'])]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
