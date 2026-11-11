import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createValidationCache } from './validation-cache.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'psop-validation-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, 'package.dkp');
  await mkdir(path.join(packageRoot, 'sources'), { recursive: true });
  const source = path.join(packageRoot, 'sources/source.txt');
  await writeFile(source, 'original');
  const manifest = { schema: 'test-dkp', package_digest: hash('package'), profile: 'test-profile', package_id: 'test-device', package_version: '1.0' };
  const bytes = JSON.stringify(manifest);
  await writeFile(path.join(packageRoot, 'manifest.json'), bytes);
  const descriptor = { root: packageRoot, manifest, descriptorDigest: hash(bytes), entries: new Map([
    ['sources/source.txt', { bytes: 8, sha256: hash('original') }],
  ]) };
  const result = { ...manifest, ok: true, valid: true };
  const directory = path.join(root, 'cache');
  let calls = 0;
  const validate = async () => { calls++; assert.equal(await readFile(source, 'utf8'), 'original'); return result; };
  const create = (overrides = {}) => createValidationCache({ directory, identity: async () => 'validator-v1', validate, ...overrides });
  return { descriptor, source, result, directory, create, calls: () => calls };
}

test('shares concurrent validation and reuses the result in a new server instance', async t => {
  const f = await fixture(t);
  const first = f.create();
  const results = await Promise.all([first(f.descriptor), first(f.descriptor), first(f.descriptor)]);
  assert.deepEqual(results, [f.result, f.result, f.result]);
  assert.equal(f.calls(), 1);
  const restarted = f.create({ validate: () => { throw new Error('Unexpected semantic replay after restart'); } });
  assert.deepEqual(await restarted(f.descriptor), f.result);
  assert.equal((await readdir(f.directory)).length, 1);
});

test('a same-size source change with restored timestamps cannot use persisted validation', async t => {
  const f = await fixture(t);
  await f.create()(f.descriptor);
  const before = await stat(f.source);
  await writeFile(f.source, 'tampered');
  await utimes(f.source, before.atime, before.mtime);
  await assert.rejects(f.create()(f.descriptor), /file integrity mismatch/);
  assert.equal(f.calls(), 1);
});

test('missing, extra, and changed manifest files invalidate cached package identity', async t => {
  const f = await fixture(t);
  await f.create()(f.descriptor);
  const extra = path.join(f.descriptor.root, 'sources/extra.txt');
  await writeFile(extra, 'unexpected');
  await assert.rejects(f.create()(f.descriptor), /Unlisted package file/);
  await unlink(extra);
  await unlink(f.source);
  await assert.rejects(f.create()(f.descriptor), /Missing package file/);
  await writeFile(f.source, 'original');
  await writeFile(path.join(f.descriptor.root, 'manifest.json'), '{}');
  await assert.rejects(f.create()(f.descriptor), /file integrity mismatch/);
});

test('a changed validator identity requires a new full validation', async t => {
  const f = await fixture(t);
  await f.create()(f.descriptor);
  await f.create({ identity: async () => 'validator-v2' })(f.descriptor);
  assert.equal(f.calls(), 2);
});

test('malformed cache and results for another package require validation again', async t => {
  const f = await fixture(t);
  await f.create()(f.descriptor);
  const file = path.join(f.directory, (await readdir(f.directory))[0]);
  await writeFile(file, '{');
  await f.create()(f.descriptor);
  assert.equal(f.calls(), 2);
  const record = JSON.parse(await readFile(file, 'utf8'));
  record.result.package_digest = hash('another package');
  await writeFile(file, JSON.stringify(record));
  await f.create()(f.descriptor);
  assert.equal(f.calls(), 3);
});

test('failed validation is not persisted or retained as an in-memory failure', async t => {
  const f = await fixture(t);
  let succeed = false;
  const verify = f.create({ validate: async () => succeed ? f.result : { valid: false } });
  await assert.rejects(verify(f.descriptor), /does not match/);
  await assert.rejects(readdir(f.directory), { code: 'ENOENT' });
  succeed = true;
  assert.deepEqual(await verify(f.descriptor), f.result);
});

test('a package changed during semantic replay cannot produce a valid cache', async t => {
  const f = await fixture(t);
  const verify = f.create({ validate: async () => { await writeFile(f.source, 'tampered'); return f.result; } });
  await assert.rejects(verify(f.descriptor), /file integrity mismatch/);
  await assert.rejects(readdir(f.directory), { code: 'ENOENT' });
});

test('accepts the complete 2415-pair and 70-Part asset inventory while rejecting extra or tampered assets', async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.descriptor.root, 'indexes/pairs'), { recursive: true });
  await mkdir(path.join(f.descriptor.root, 'indexes/parts'), { recursive: true });
  const assets = [
    ...Array.from({ length: 2415 }, (_, index) => `indexes/pairs/${String(index).padStart(4, '0')}.json`),
    ...Array.from({ length: 70 }, (_, index) => `indexes/parts/${index}.json`),
    'indexes/compatibility.json',
  ];
  const bytes = '{}', record = { bytes: 2, sha256: hash(bytes) };
  for (let offset = 0; offset < assets.length; offset += 64) {
    await Promise.all(assets.slice(offset, offset + 64).map(async entry => {
      await writeFile(path.join(f.descriptor.root, ...entry.split('/')), bytes);
      f.descriptor.entries.set(entry, record);
    }));
  }
  assert.ok(f.descriptor.entries.size > 2415 + 70);
  assert.deepEqual(await f.create()(f.descriptor), f.result);
  assert.deepEqual(await f.create()(f.descriptor), f.result);
  assert.equal(f.calls(), 1);
  const extra = path.join(f.descriptor.root, 'indexes/pairs/0000-extra.json');
  await writeFile(extra, bytes);
  await assert.rejects(f.create()(f.descriptor), /Unlisted package file/);
  await unlink(extra);
  await writeFile(path.join(f.descriptor.root, 'indexes/pairs/0000.json'), '[]');
  await assert.rejects(f.create()(f.descriptor), /file integrity mismatch/);
  assert.equal(f.calls(), 1);
});
