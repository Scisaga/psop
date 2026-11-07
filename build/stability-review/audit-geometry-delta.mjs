import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const previousManifest = JSON.parse(fs.readFileSync('build/microduck/source-1.10/microduck-1.dkp/manifest.json', 'utf8'));
const before = JSON.parse(fs.readFileSync('build/microduck/source-1.10/microduck-1.dkp/' + previousManifest.entrypoints.scene, 'utf8'));
const manifest = JSON.parse(fs.readFileSync('build/microduck/source-1.11/microduck-connection-analysis.dkp/manifest.json', 'utf8'));
const after = JSON.parse(fs.readFileSync('build/microduck/source-1.11/microduck-connection-analysis.dkp/' + manifest.entrypoints.scene, 'utf8'));
for (const collection of ['features','logical_holes','circular_openings','passage_hypotheses','mounting_interfaces','reference_mounts','pin_hole_fits','installation_hypotheses']) {
  const previous = before.analysis[collection], current = after.analysis[collection];
  const differences = [];
  for (const item of previous) {
    const next = current.find(other => other.id === item.id);
    if (!next) differences.push({ id: item.id, missing: true });
    else for (const key of new Set([...Object.keys(item), ...Object.keys(next)])) if (!isDeepStrictEqual(item[key], next[key])) differences.push({ id: item.id, key, before: item[key], after: next[key] });
  }
  console.log(JSON.stringify({ collection, before: previous.length, after: current.length, differences: differences.slice(0,3), differenceCount: differences.length, addedIds: current.filter(item => !previous.some(other => other.id === item.id)).map(item => item.id).slice(0,10) }));
}
