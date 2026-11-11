import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultAppRoot = fileURLToPath(new URL('../', import.meta.url));

export async function resolvePython({ appRoot = defaultAppRoot, environment = process.env, platform = process.platform } = {}) {
  if (environment.PSOP_PYTHON) return environment.PSOP_PYTHON;
  if (platform === 'win32') {
    const bundled = path.join(appRoot, '.runtime', 'python', 'python.exe');
    try { await access(bundled, constants.X_OK); return bundled; }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  }
  return 'python';
}

export async function runPythonJson(arguments_, { cwd = process.cwd(), timeout = 300000, python } = {}) {
  const executable = python || await resolvePython();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-B', ...arguments_], {
      cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let output = '', errors = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`DKP validation timed out after ${timeout / 1000} seconds.`)); }, timeout);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', text => { output += text; });
    child.stderr.on('data', text => { errors += text; });
    child.once('error', error => {
      clearTimeout(timer);
      reject(new Error(`DKP validation failed: Cannot start Python (${executable}): ${error.message}`));
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        let detail = errors.trim() || output.trim();
        try {
          const result = JSON.parse(output);
          const reason = result?.errors || result?.error || result;
          detail = typeof reason === 'string' ? reason : JSON.stringify(reason);
        } catch { /* Python may fail before it can produce JSON. Preserve its diagnostic. */ }
        const status = signal ? `Python was terminated by ${signal}` : `Python exited with code ${code}`;
        reject(new Error(`DKP validation failed: ${status}. ${detail || 'The process returned no output.'}`));
        return;
      }
      if (!output.trim()) {
        reject(new Error(`DKP validation failed: Python returned no JSON output.${errors.trim() ? ' ' + errors.trim() : ''}`));
        return;
      }
      try { resolve(JSON.parse(output)); }
      catch (error) { reject(new Error(`DKP validation failed: ${errors.trim() || `Invalid JSON output from Python (${error.message}).`}`)); }
    });
  });
}
