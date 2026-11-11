import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolvePython, runPythonJson } from './python-runtime.mjs';

async function fixture(t) {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'psop-python-runtime-'));
  t.after(() => rm(appRoot, { recursive: true, force: true }));
  const bundled = path.join(appRoot, '.runtime', 'python', 'python.exe');
  await mkdir(path.dirname(bundled), { recursive: true });
  return { appRoot, bundled };
}

test('an explicit Python configuration takes precedence over the bundled runtime', async t => {
  const { appRoot, bundled } = await fixture(t);
  await writeFile(bundled, 'fixture');
  assert.equal(await resolvePython({ appRoot, environment: { PSOP_PYTHON: 'configured-python' }, platform: 'win32' }), 'configured-python');
});

test('a Windows restart without inherited configuration finds the bundled Python', async t => {
  const { appRoot, bundled } = await fixture(t);
  await writeFile(bundled, 'fixture', { mode: 0o700 });
  assert.equal(await resolvePython({ appRoot, environment: {}, platform: 'win32' }), bundled);
});

test('system Python remains the fallback when no matching bundled runtime exists', async t => {
  const { appRoot, bundled } = await fixture(t);
  assert.equal(await resolvePython({ appRoot, environment: {}, platform: 'win32' }), 'python');
  await writeFile(bundled, 'fixture');
  assert.equal(await resolvePython({ appRoot, environment: {}, platform: 'linux' }), 'python');
});

test('the selected interpreter returns parsed JSON', async () => {
  const result = await runPythonJson(['-c', 'import json, sys; print(json.dumps({"ok": True, "executable": sys.executable}))']);
  assert.equal(result.ok, true);
  assert.ok(result.executable);
});

test('a Python failure without JSON exposes stderr and the exit code', async () => {
  await assert.rejects(runPythonJson(['-c', 'import sys; sys.stderr.write("Python runtime is unavailable"); sys.exit(7)']), error => {
    assert.match(error.message, /Python exited with code 7/);
    assert.match(error.message, /Python runtime is unavailable/);
    assert.doesNotMatch(error.message, /Unexpected end of JSON/);
    return true;
  });
});

test('structured validator failures preserve the reported package errors', async () => {
  await assert.rejects(runPythonJson(['-c', 'import json, sys; print(json.dumps({"errors": ["package content changed"]})); sys.exit(1)']), /package content changed/);
});

test('empty and malformed successful output have explicit diagnostics', async () => {
  await assert.rejects(runPythonJson(['-c', 'pass']), /Python returned no JSON output/);
  await assert.rejects(runPythonJson(['-c', 'print("{")']), /Invalid JSON output from Python/);
});

test('a missing configured interpreter reports a startup failure', async t => {
  const { appRoot } = await fixture(t);
  await assert.rejects(runPythonJson(['-c', 'pass'], { python: path.join(appRoot, 'missing-python') }), /Cannot start Python/);
});

test('a stalled Python process times out and is terminated', async () => {
  await assert.rejects(runPythonJson(['-c', 'import time; time.sleep(30)'], { timeout: 100 }), /DKP validation timed out/);
});
