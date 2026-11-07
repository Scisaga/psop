import fs from 'node:fs';
import path from 'node:path';
import { loadPackage } from '../../apps/workbench/scripts/dkp.mjs';
import { registerPackage } from '../../apps/workbench/scripts/workspaces.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const dkp = path.join(repo, 'build/microduck/source-1.11/microduck-connection-analysis.dkp');
// loadPackage calls the actual Build validate CLI, including deterministic
// replay, and stores its verified result for the subsequent registration/read.
const bundle = await loadPackage(dkp);
if (!bundle.validation.valid) throw new Error('The finalized release failed semantic validation.');
fs.writeFileSync(path.join(import.meta.dirname, 'validate.json'), JSON.stringify(bundle.validation, null, 2));
console.log(JSON.stringify({ step: 'validate', valid: true, digest: bundle.manifest.package_digest }));
const registered = await registerPackage({ dkp, workspaceId: 'microduck' });
fs.writeFileSync(path.join(import.meta.dirname, 'registration.json'), JSON.stringify(registered, null, 2));
console.log(JSON.stringify({ step: 'register', ...registered }));
