import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { appRoot } from './dkp.mjs';
import { resolvePython } from './python-runtime.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };

function run(executable, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd: appRoot, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Process stopped with code ${code}: ${path.basename(executable)}`)));
  });
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node.js 22.12 or later is required.');
  const bind = option('--bind', '127.0.0.1');
  const port = Number(option('--port', '8780'));
  if (!net.isIP(bind) || ['0.0.0.0', '::'].includes(bind) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Use a specific local IP and a port in 1..65535.');
  }
  const url = `http://${net.isIP(bind) === 6 ? `[${bind}]` : bind}:${port}/`;
  const response = await fetch(new URL('health', url), { signal: AbortSignal.timeout(1500) }).catch(() => null);
  if (response) {
    const health = await response.json().catch(() => null);
    if (!response.ok || health?.app !== 'psop-workbench') throw new Error(`Port ${port} is occupied by another service.`);
    console.log(`PSOP Workbench is already running: ${url}`);
    if (!args.includes('--no-browser') && process.platform === 'win32') {
      await run('powershell.exe', ['-NoProfile', '-Command', `Start-Process -FilePath '${url}'`]);
    }
    return;
  }
  try { await access(path.join(appRoot, 'node_modules/vite/bin/vite.js')); }
  catch {
    if (process.platform === 'win32') await run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm.cmd', 'ci']);
    else await run('npm', ['ci']);
  }
  await run(await resolvePython(), ['-B', 'scripts/prepare_workspace.py']);
  await run(process.execPath, ['node_modules/typescript/bin/tsc', '-b']);
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  await run(process.execPath, ['scripts/serve.mjs', '--bind', bind, '--port', String(port),
    ...(args.includes('--no-browser') ? [] : ['--open'])]);
}

try { await main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
