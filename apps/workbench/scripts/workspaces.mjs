import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertIdentifier, defaultRegistry, loadPackage, readDescriptor, readRegistry, writeRegistry, workspaceCatalog } from './dkp.mjs';

export async function registerPackage({ dkp, workspaceId, registryFile = defaultRegistry, name }) {
  const bundle = await loadPackage(dkp);
  const registry = await readRegistry(registryFile);
  const device = bundle.manifest.device;
  const id = assertIdentifier(workspaceId || device.id, 'workspace ID');
  let workspace = registry.workspaces.find(item => item.id === id);
  if (workspace && workspace.deviceId !== device.id) throw new Error('A workspace can only contain snapshots of its own device.');
  if (!workspace) { workspace = { id, deviceId: device.id, name: name || device.name, description: '', snapshots: [] }; registry.workspaces.push(workspace); }
  const digest = bundle.manifest.package_digest;
  const snapshotId = `dkp-${digest.slice(0, 20)}`;
  const previous = workspace.snapshots.find(item => item.packageDigest === digest);
  if (previous) return { workspaceId: id, snapshotId: previous.id, unchanged: true };
  if (workspace.snapshots.some(item => item.id === snapshotId)) throw new Error('Snapshot ID collision.');
  for (const snapshot of workspace.snapshots) {
    // Version identity is manifest metadata; historical content is replayed when selected.
    const old = await readDescriptor(path.resolve(path.dirname(registryFile), snapshot.path));
    if (old.manifest.package_digest !== snapshot.packageDigest || old.manifest.device.id !== workspace.deviceId) throw new Error('Registered DKP metadata changed. Restore it before registering another version.');
    if (old.manifest.package_id === bundle.manifest.package_id && old.manifest.package_version === bundle.manifest.package_version) throw new Error('This package version already has another digest. Publish a new version.');
  }
  workspace.snapshots.push({ id: snapshotId, path: path.relative(path.dirname(registryFile), bundle.root).split(path.sep).join('/'), packageDigest: digest });
  workspace.selectedSnapshotId = snapshotId;
  await writeRegistry(registryFile, registry);
  return { workspaceId: id, snapshotId, packageDigest: digest, unchanged: false };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (key, fallback) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
  const registryFile = path.resolve(option('--registry', defaultRegistry));
  if (args[0] === 'register') {
    const dkp = option('--dkp');
    if (!dkp) throw new Error('Usage: workspaces.mjs register --dkp PATH [--workspace ID] [--registry PATH]');
    return registerPackage({ dkp: path.resolve(dkp), workspaceId: option('--workspace'), registryFile, name: option('--name') });
  }
  if (args[0] === 'create') {
    const id = assertIdentifier(option('--id'), 'workspace ID');
    const deviceId = assertIdentifier(option('--device-id'), 'device ID');
    const name = option('--name');
    if (!name) throw new Error('A device name is required.');
    const registry = await readRegistry(registryFile);
    if (registry.workspaces.some(item => item.id === id)) throw new Error('The workspace already exists.');
    registry.workspaces.push({ id, deviceId, name, description: option('--description', ''), snapshots: [] });
    await writeRegistry(registryFile, registry);
    return { workspaceId: id, deviceId, snapshots: 0 };
  }
  if (args[0] === 'list') return workspaceCatalog(registryFile);
  throw new Error('Commands: register, create, list. Workspace records remain outside immutable DKP packages.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
}
