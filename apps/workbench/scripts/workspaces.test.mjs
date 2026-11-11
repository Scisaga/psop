import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { defaultRegistry, REGISTRY_SCHEMA, readRegistry, writeRegistry, workspaceCatalog, workspaceView,
  loadPackage, readPackageEntry, relativeEntry } from './dkp.mjs';
import { registerPackage } from './workspaces.mjs';

const rootRegistry = await readRegistry();
const registered = rootRegistry.workspaces.find(workspace => workspace.snapshots.length);
if (!registered) throw new Error('Run npm run prepare:workspace before testing DKP integration.');
const published = registered.snapshots.at(-1);
const packageDirectory = path.resolve(path.dirname(defaultRegistry), published.path);
const bundle = await loadPackage(packageDirectory);

test('registers validated v2 data packages, preserves snapshots, and returns mounted view URLs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'psop-workspaces-'));
  const registryFile = path.join(root, 'registry.json');
  const first = await registerPackage({ dkp: packageDirectory, workspaceId: 'test-device', registryFile });
  const again = await registerPackage({ dkp: packageDirectory, workspaceId: 'test-device', registryFile });
  assert.equal(again.unchanged, true);
  assert.equal(first.snapshotId, again.snapshotId);
  const catalog = await workspaceCatalog(registryFile);
  assert.equal(catalog.workspaces.length, 1);
  assert.equal(catalog.workspaces[0].snapshots.length, 1);
  const view = await workspaceView('test-device', first.snapshotId, registryFile);
  assert.equal(view.meta.packageDigest, bundle.manifest.package_digest);
  assert.equal(view.meta.inputKind, 'dkp');
  assert.equal(view.meta.validation.valid, true);
  assert.equal(view.parts.length, 70);
  assert.match(view.parts[0].geometryUrl, /^\/api\/workspaces\/test-device\/snapshots\/.+\/assets\//);
  assert.match(view.sources[0].url, /^\/api\/workspaces\//);
  assert.equal(view.parts.some(part => /^CMP-|^MD-P-/.test(part.id)), false);
});

test('allows an empty device workspace but refuses cross-device package registration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'psop-workspaces-'));
  const registryFile = path.join(root, 'registry.json');
  await writeRegistry(registryFile, { schema: REGISTRY_SCHEMA, workspaces: [
    { id: 'another-device', deviceId: 'another-device', name: 'Another device', snapshots: [] },
  ] });
  assert.equal((await workspaceCatalog(registryFile)).workspaces[0].snapshots.length, 0);
  await assert.rejects(registerPackage({ dkp: packageDirectory, workspaceId: 'another-device', registryFile }), /own device/);
});

test('rejects retired package contracts and contained-path violations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'psop-retired-dkp-'));
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ schema: 'psop.dkp/1.0', package_digest: '0'.repeat(64) }));
  await assert.rejects(loadPackage(root), /Unsupported DKP schema/);
  for (const entry of ['../source.stl', '/source.stl', 'C:/source.stl', 'sources\\source.stl', 'sources/../source.stl']) {
    assert.throws(() => relativeEntry(entry), /contained relative POSIX/);
  }
});

test('checks asset identity on every read, including after initial package validation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'psop-asset-identity-'));
  await mkdir(path.join(root, 'sources'));
  const original = Buffer.from('registered source bytes');
  const expected = createHash('sha256').update(original).digest('hex');
  const file = path.join(root, 'sources', 'source.txt');
  await writeFile(file, original);
  const mounted = { root, entries: new Map([['sources/source.txt', { bytes: original.length, sha256: expected }]]) };
  assert.deepEqual(await readPackageEntry(mounted, 'sources/source.txt'), original);
  await writeFile(file, 'modified source bytes');
  await assert.rejects(readPackageEntry(mounted, 'sources/source.txt'), /has changed/);
  await assert.rejects(readPackageEntry(mounted, 'manifest.json'), /not registered/);
});

test('workspace state stays outside the published package', async () => {
  const bytes = await readFile(path.join(packageDirectory, 'manifest.json'));
  const catalog = await workspaceCatalog();
  assert.ok(catalog.workspaces.some(workspace => workspace.deviceId === bundle.manifest.device.id));
  assert.deepEqual(await readFile(path.join(packageDirectory, 'manifest.json')), bytes);
  assert.equal(bundle.manifest.files.some(file => /^(apps|app|workspaces)\//.test(file.path)), false);
});

test('catalog verifies registered manifest metadata and defers content replay until selection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'psop-catalog-metadata-'));
  const registryFile = path.join(root, 'registry.json');
  await writeFile(path.join(root, 'manifest.json'), await readFile(path.join(packageDirectory, 'manifest.json')));
  await writeRegistry(registryFile, { schema: REGISTRY_SCHEMA, workspaces: [{
    id: 'metadata-only', deviceId: bundle.manifest.device.id, name: 'Metadata', snapshots: [{
      id: 'snapshot', path: '.', packageDigest: bundle.manifest.package_digest,
    }],
  }] });
  const catalog = await workspaceCatalog(registryFile);
  const snapshot = catalog.workspaces[0].snapshots[0];
  assert.deepEqual(snapshot.counts, bundle.manifest.counts);
  assert.equal(snapshot.createdAt, bundle.manifest.created_at);
  assert.equal(snapshot.validation, undefined);
  await assert.rejects(workspaceView('metadata-only', 'snapshot', registryFile), /validation failed|missing|Unlisted/i);
  const changed = { ...bundle.manifest, package_version: 'tampered' };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(changed));
  await assert.rejects(workspaceCatalog(registryFile), /manifest digest mismatch/i);
});

test('registration checks historical version identity without replaying unrelated historical content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'psop-register-metadata-'));
  const registryFile = path.join(root, 'registry.json');
  const { package_digest, ...unsigned } = { ...bundle.manifest, created_at: '2025-01-01T00:00:00Z' };
  const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
  const historical = { ...unsigned, package_digest: createHash('sha256').update(canonical(unsigned)).digest('hex') };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(historical));
  const registry = { schema: REGISTRY_SCHEMA, workspaces: [{
    id: 'registration', deviceId: bundle.manifest.device.id, name: 'Metadata', snapshots: [{
      id: 'historical', path: '.', packageDigest: historical.package_digest,
    }],
  }] };
  await writeRegistry(registryFile, registry);
  await assert.rejects(registerPackage({ dkp: packageDirectory, workspaceId: 'registration', registryFile }), /Publish a new version/);
  registry.workspaces[0].snapshots[0].packageDigest = '0'.repeat(64);
  await writeRegistry(registryFile, registry);
  await assert.rejects(registerPackage({ dkp: packageDirectory, workspaceId: 'registration', registryFile }), /metadata changed/);
});
