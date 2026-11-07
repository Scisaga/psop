import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/inspection-visibility.ts', import.meta.url), 'utf8');
const { stableObstructions } = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
const state = (ids = []) => ({ translucentPartIds: new Set(ids), candidates: new Map() });
const sample = (current, counts, time) => {
  const result = stableObstructions(current, new Map(Object.entries(counts)), 9, time);
  current.translucentPartIds = result.translucentPartIds;
  return result;
};
test('a grazing ray cannot fade an entire part; a sustained obstruction can', () => {
  const current = state();
  assert.equal(sample(current, { part: 1 }, 0).changed, false);
  assert.equal(sample(current, { part: 1 }, 1000).changed, false);
  assert.equal(sample(current, { part: 5 }, 1100).pending, true);
  assert.equal(sample(current, { part: 5 }, 1210).changed, false);
  assert.equal(sample(current, { part: 5 }, 1340).changed, true);
  assert.deepEqual([...current.translucentPartIds], ['part']);
});
test('zero-hit excursions do not repeatedly restore a transparent part', () => {
  const current = state(['part']);
  sample(current, {}, 0);
  assert.equal(sample(current, {}, 240).changed, false);
  sample(current, { part: 1 }, 360);
  assert.equal(current.candidates.size, 0);
  sample(current, {}, 480);
  assert.equal(sample(current, {}, 840).changed, false);
  assert.equal(sample(current, {}, 960).changed, true);
  assert.deepEqual([...current.translucentPartIds], []);
});
test('camera motion clears unfinished decisions instead of carrying a stale timer', () => {
  const current = state();
  sample(current, { part: 9 }, 0);
  current.candidates.clear();
  assert.equal(sample(current, { part: 9 }, 10000).changed, false);
  assert.equal(sample(current, { part: 9 }, 10240).changed, true);
});
