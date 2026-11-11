import { readFile, realpath, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createValidationCache } from './validation-cache.mjs';
import { runPythonJson } from './python-runtime.mjs';

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(appRoot, '..', '..');
export const defaultRegistry = path.join(repoRoot, 'workspaces', 'registry.json');
export const REGISTRY_SCHEMA = 'psop.workspace-registry/1.0';
export const DKP_SCHEMA = 'psop.dkp/2.0-draft.1';

export function assertIdentifier(value, label = 'identifier') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

export function relativeEntry(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || /^[a-zA-Z]:/.test(value)
    || value.split('/').some(piece => !piece || piece === '.' || piece === '..') || value.includes('\0')) {
    throw new Error('The package entry must be a contained relative POSIX path.');
  }
  return value;
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function runPython(arguments_, timeout = 300000) {
  return runPythonJson(arguments_, { cwd: repoRoot, timeout });
}

const validatePackage = createValidationCache({
  directory: path.join(repoRoot, '.runtime', 'dkp-validation'),
  identity: async () => {
    const runtime = await runPython(['-c', [
      'import sys, json, importlib.metadata',
      'sys.path.insert(0, "skills/psop-build/scripts")',
      'from psop_build_v2.package import tool_digest',
      'print(json.dumps({"tool": tool_digest(), "python": sys.version, "executable": sys.executable, "platform": sys.platform, "dependencies": sorted((d.metadata["Name"], d.version) for d in importlib.metadata.distributions())}))',
    ].join('\n')], 30000);
    return sha256(Buffer.concat([Buffer.from(JSON.stringify(runtime)), await readFile(new URL('./validation-cache.mjs', import.meta.url))]));
  },
  // Full source-solid replay is a one-time cold validation, then content-
  // checked cache hits serve the workbench without repeating the geometry.
  validate: root => runPython([path.join(repoRoot, 'skills/psop-build/scripts/psop_build.py'), 'validate', '--dkp', root], 900000),
});

export async function readDescriptor(directory) {
  const root = await realpath(directory);
  const bytes = await readFile(path.join(root, 'manifest.json'));
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.schema !== DKP_SCHEMA) throw new Error(`Unsupported DKP schema: ${manifest.schema || 'missing'}. Only v2 data packages are accepted.`);
  if (!['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10', '1.11', '1.12', '1.13', '1.14', '1.15'].some(version => manifest.profile === `psop.hardware.source-model/${version}`)) throw new Error('Unsupported DKP knowledge profile.');
  if (!/^[a-f0-9]{64}$/.test(manifest.package_digest || '') || !Array.isArray(manifest.files)) throw new Error('Invalid DKP manifest.');
  if (!manifest.device?.id || !manifest.device?.name || !manifest.entrypoints?.scene) throw new Error('DKP device or scene entry is missing.');
  const { package_digest, ...unsigned } = manifest;
  if (sha256(Buffer.from(canonical(unsigned), 'utf8')) !== package_digest) throw new Error('Package manifest digest mismatch.');
  const entries = new Map();
  for (const file of manifest.files) {
    relativeEntry(file.path);
    if (/^(apps|app)\//.test(file.path) || entries.has(file.path)) throw new Error('Embedded applications and duplicate package entries are not supported.');
    if (!/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error('Invalid package file descriptor.');
    entries.set(file.path, file);
  }
  return { root, manifest, entries, descriptorDigest: sha256(bytes) };
}

export async function loadPackage(directory) {
  const descriptor = await readDescriptor(directory);
  const { root, manifest, entries } = descriptor;
  const validation = await validatePackage(descriptor);
  return { root, manifest, entries, validation };
}

export async function readPackageEntry(bundle, entry) {
  relativeEntry(entry);
  const expected = bundle.entries.get(entry);
  if (!expected) throw new Error('The asset is not registered in this package.');
  const resolved = await realpath(path.join(bundle.root, ...entry.split('/')));
  if (!resolved.startsWith(bundle.root + path.sep)) throw new Error('Package asset escapes its root.');
  const bytes = await readFile(resolved);
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error('The registered package asset has changed. Rebuild and register a new snapshot.');
  return bytes;
}

export async function readRegistry(filename = defaultRegistry) {
  let registry;
  try { registry = JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { schema: REGISTRY_SCHEMA, workspaces: [] }; throw error; }
  if (registry.schema !== REGISTRY_SCHEMA || !Array.isArray(registry.workspaces)) throw new Error('Unsupported workspace registry.');
  const workspaceIds = new Set();
  for (const workspace of registry.workspaces) {
    assertIdentifier(workspace.id, 'workspace ID');
    assertIdentifier(workspace.deviceId, 'device ID');
    if (!workspace.name || workspaceIds.has(workspace.id) || !Array.isArray(workspace.snapshots)) throw new Error('Invalid workspace registry entry.');
    workspaceIds.add(workspace.id);
    const snapshotIds = new Set();
    for (const snapshot of workspace.snapshots) {
      assertIdentifier(snapshot.id, 'snapshot ID');
      if (snapshotIds.has(snapshot.id) || typeof snapshot.path !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.packageDigest || '')) throw new Error('Invalid snapshot registration.');
      snapshotIds.add(snapshot.id);
    }
  }
  return registry;
}

export async function writeRegistry(filename, registry) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(registry, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

async function registeredBundle(workspace, snapshot, registryFile, loader = loadPackage) {
  const bundle = await loader(path.resolve(path.dirname(registryFile), snapshot.path));
  if (bundle.manifest.package_digest !== snapshot.packageDigest) throw new Error('Registered DKP digest changed. Register a new snapshot instead of replacing an existing package.');
  if (bundle.manifest.device.id !== workspace.deviceId) throw new Error('The registered DKP belongs to another device.');
  return bundle;
}

export async function workspaceCatalog(registryFile = defaultRegistry) {
  const registry = await readRegistry(registryFile);
  const workspaces = [];
  for (const workspace of registry.workspaces) {
    const snapshots = [];
    for (const snapshot of workspace.snapshots) {
      // A catalog lists registered manifest metadata. Content is fully replayed
      // on selection/read, so unrelated historical geometry cannot delay it.
      const bundle = await registeredBundle(workspace, snapshot, registryFile, readDescriptor);
      snapshots.push({ id: snapshot.id, packageId: bundle.manifest.package_id, packageVersion: bundle.manifest.package_version,
        packageDigest: bundle.manifest.package_digest, ontologyVersion: bundle.manifest.ontology.version,
        createdAt: bundle.manifest.created_at, counts: bundle.manifest.counts });
    }
    workspaces.push({ id: workspace.id, deviceId: workspace.deviceId, name: workspace.name, description: workspace.description || '', snapshots, selectedSnapshotId: workspace.selectedSnapshotId });
  }
  return { workspaces };
}

export async function findSnapshot(workspaceId, snapshotId, registryFile = defaultRegistry) {
  const registry = await readRegistry(registryFile);
  const workspace = registry.workspaces.find(item => item.id === workspaceId);
  const snapshot = workspace?.snapshots.find(item => item.id === snapshotId);
  if (!workspace || !snapshot) throw Object.assign(new Error('Workspace or snapshot not found.'), { status: 404 });
  return registeredBundle(workspace, snapshot, registryFile);
}

export function mountCapabilityIndex(index, assetUrl, base) {
  if (!index) return index;
  return {
    ...index,
    asset_base: base,
    parts: Object.fromEntries(Object.entries(index.parts || {}).map(([owner, entry]) => [owner, { ...entry, path: assetUrl(entry.path) }])),
    ...(index.compatibility?.index_path ? { compatibility: { ...index.compatibility, index_path: assetUrl(index.compatibility.index_path) } } : {}),
    ...(index.review_path ? { review_path: assetUrl(index.review_path) } : {}),
  };
}

export async function workspaceView(workspaceId, snapshotId, registryFile = defaultRegistry) {
  const bundle = await findSnapshot(workspaceId, snapshotId, registryFile);
  const data = JSON.parse((await readPackageEntry(bundle, bundle.manifest.entrypoints.scene)).toString('utf8'));
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/snapshots/${encodeURIComponent(snapshotId)}/assets/`;
  const assetUrl = entry => {
    relativeEntry(entry);
    if (!bundle.entries.has(entry)) throw new Error('View references an unregistered asset.');
    return base + entry.split('/').map(encodeURIComponent).join('/');
  };
  for (const part of data.parts) part.geometryUrl = assetUrl(part.geometryUrl);
  for (const source of data.sources) source.url = assetUrl(source.url);
  if (data.assembly?.capability_index) data.assembly.capability_index = mountCapabilityIndex(data.assembly.capability_index, assetUrl, base);
  const capabilities = Object.fromEntries(Object.entries(bundle.manifest.capabilities).map(([key, value]) => [key, { ...value, description: value.description || (typeof value.scope === 'string' ? value.scope : undefined) }]));
  Object.assign(data.meta, { packageId: bundle.manifest.package_id, packageVersion: bundle.manifest.package_version,
    packageDigest: bundle.manifest.package_digest, dkpSchema: bundle.manifest.schema, inputKind: 'dkp',
    ontologyVersion: bundle.manifest.ontology.version, capabilities, validation: { valid: true, profile: bundle.validation.profile } });
  return data;
}
