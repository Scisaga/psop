import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const SCHEMA = 'psop.local-dkp-validation/1.0';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function fileDigest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

// Reuse semantic replay only when every byte and the complete file inventory
// still match. Timestamps and sizes alone cannot establish package identity.
async function verifyFiles({ root, entries, descriptorDigest }) {
  const expected = new Set(['manifest.json', ...entries.keys()]);
  // Capability packages publish one asset per Part and per unordered Part pair.
  // Bound traversal by the declared inventory rather than rejecting valid large
  // inventories at the old prototype's fixed 2400-entry limit.
  const entryBudget = Math.max(2400, entries.size * 2 + 64);
  let count = 0;
  async function walk(directory, prefix = '') {
    for (const name of await readdir(directory)) {
      if (++count > entryBudget) throw new Error('DKP contains excessive filesystem entries.');
      const entry = prefix + name;
      const filename = path.join(directory, name);
      const info = await lstat(filename);
      if (info.isSymbolicLink()) throw new Error('Symlinks are not allowed in DKP.');
      if (info.isDirectory()) await walk(filename, entry + '/');
      else {
        if (!info.isFile() || !expected.delete(entry)) throw new Error(`Unlisted package file: ${entry}`);
        const record = entries.get(entry);
        if ((record && info.size !== record.bytes) || await fileDigest(filename) !== (record?.sha256 || descriptorDigest)) {
          throw new Error(`Package file integrity mismatch: ${entry}. Rebuild and register a new snapshot.`);
        }
      }
    }
  }
  await walk(root);
  if (expected.size) throw new Error(`Missing package file: ${expected.values().next().value}`);
}

function matches(result, manifest) {
  return result?.ok === true && result.valid === true && result.schema === manifest.schema && result.package_digest === manifest.package_digest
    && result.profile === manifest.profile && result.package_id === manifest.package_id
    && result.package_version === manifest.package_version;
}

export function createValidationCache({ directory, identity, validate }) {
  const pending = new Map();
  // A new server resolves its installed validator and runtime again.
  let identityPromise;
  return function validatePackage(descriptor) {
    const memoryKey = `${descriptor.root}:${descriptor.descriptorDigest}`;
    if (!pending.has(memoryKey)) {
      const operation = (async () => {
        const validator = await (identityPromise ||= Promise.resolve().then(identity).catch(error => { identityPromise = undefined; throw error; }));
        const key = sha256(JSON.stringify([SCHEMA, descriptor.root, descriptor.descriptorDigest, validator]));
        const filename = path.join(directory, key + '.json');
        let previous;
        try { previous = JSON.parse(await readFile(filename, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
        await verifyFiles(descriptor);
        if (previous?.schema === SCHEMA && previous.key === key && matches(previous.result, descriptor.manifest)) return previous.result;
        const result = await validate(descriptor.root);
        if (!matches(result, descriptor.manifest)) throw new Error('Validator result does not match the selected DKP.');
        // Do not attest a package modified while the expensive replay ran.
        await verifyFiles(descriptor);
        const temporary = `${filename}.${randomUUID()}.tmp`;
        try {
          await mkdir(directory, { recursive: true });
          await writeFile(temporary, JSON.stringify({ schema: SCHEMA, key, result }), { flag: 'wx' });
          await rename(temporary, filename);
        } catch (error) {
          // Cache storage is optional; successful validation remains usable.
          console.warn(`Cannot save local DKP validation cache: ${error.message}`);
        } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') console.warn(error.message); }); }
        return result;
      })().catch(error => { pending.delete(memoryKey); throw error; });
      pending.set(memoryKey, operation);
    }
    return pending.get(memoryKey);
  };
}
