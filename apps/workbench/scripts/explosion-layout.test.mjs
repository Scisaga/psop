import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { planExplosion } from '../src/explosion-layout.ts';

function part(id, at, size, kind = 'structure', body = 'core', group = 'assembly') {
  const position = new Vector3().fromArray(at), half = new Vector3().fromArray(size).multiplyScalar(.5);
  return {
    part: { id, name: id, meshKey: id, body, group, groupLabel: group, kind, position: at, quaternion: [0, 0, 0, 1], scale: [1, 1, 1], rgba: [1, 1, 1, 1], geometryUrl: id, sourceIds: [], evidenceIds: [], locator: '' },
    bounds: new Box3(position.clone().sub(half), position.clone().add(half)),
  };
}
function body(name, parent = null, position = [0, 0, 0], quaternion = [0, 0, 0, 1]) {
  return { id: name, name, parent, label: name, position, quaternion, group: '', partIds: [] };
}
const placed = (entry, offsets) => entry.bounds.clone().translate(offsets.get(entry.part.id));
function separated(entries, offsets) {
  assert.equal(offsets.size, entries.length);
  for (const offset of offsets.values()) assert.ok(offset.toArray().every(Number.isFinite));
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    assert.ok(!placed(entries[i], offsets).intersectsBox(placed(entries[j], offsets)), `${entries[i].part.id} overlaps ${entries[j].part.id}`);
  }
}
function near(actual, expected, tolerance = 1e-10) {
  actual.toArray().forEach((value, i) => assert.ok(Math.abs(value - expected.toArray()[i]) < tolerance, `${actual.toArray()} != ${expected.toArray()}`));
}
function nested() {
  return [
    part('core', [0, 0, 0], [.04, .03, .02]),
    part('top-cover', [0, 0, .012], [.06, .05, .025], 'shell'),
    part('bottom-cover', [0, 0, -.012], [.06, .05, .025], 'shell'),
    part('front-cover', [.024, 0, 0], [.01, .05, .04], 'shell'),
    part('lens', [.027, 0, 0], [.015, .015, .015], 'electronics'),
    part('thin-bearing', [0, 0, 0], [.015, .015, .002], 'bearing'),
  ];
}

test('nested covers, a concentric bearing and a lens separate without mutating source placements or boxes', () => {
  const entries = nested(), bodies = [body('core')], before = JSON.stringify({ entries, bodies });
  const offsets = planExplosion(entries, bodies);
  separated(entries, offsets);
  assert.equal(JSON.stringify({ entries, bodies }), before);
  assert.ok(offsets.get('top-cover').z > 0);
  assert.ok(offsets.get('bottom-cover').z < 0);
  near(new Vector3(offsets.get('thin-bearing').x, offsets.get('thin-bearing').y, 0), new Vector3());
  assert.ok(Math.abs(offsets.get('thin-bearing').z) > .01);
});

test('a distant obstacle does not push a small attachment past the nearest available gap', () => {
  const entries = [
    part('core', [0, 0, 0], [.02, .02, .02]),
    part('far-top', [0, 0, .08], [.02, .02, .02]),
    part('far-bottom', [0, 0, -.16], [.02, .02, .02]),
    part('bearing', [0, 0, 0], [.015, .015, .002], 'bearing'),
  ];
  const offsets = planExplosion(entries, [body('core')]);
  separated(entries, offsets);
  assert.ok(offsets.get('bearing').z > .01 && offsets.get('bearing').z < .025);
  near(offsets.get('far-top'), new Vector3());
  near(offsets.get('far-bottom'), new Vector3());
});

test('internal expansion is independent of part input order and opaque identifiers', () => {
  const entries = nested(), bodies = [body('core')], expected = planExplosion(entries, bodies);
  const shuffled = [...entries].reverse();
  const renamed = shuffled.map((entry, i) => ({ ...entry, part: { ...entry.part, id: `opaque-${i}` } }));
  const reordered = planExplosion(shuffled, bodies), renamedOffsets = planExplosion(renamed, bodies);
  for (const entry of entries) near(reordered.get(entry.part.id), expected.get(entry.part.id));
  renamed.forEach((entry, i) => near(renamedOffsets.get(entry.part.id), expected.get(shuffled[i].part.id)));
});

test('clearance scales with geometry and is unchanged by a world-space translation', () => {
  const entries = nested(), bodies = [body('core')], expected = planExplosion(entries, bodies);
  for (const scale of [.01, 1000]) {
    const shift = new Vector3(7, -3, 11);
    const transformed = entries.map(entry => ({ ...entry, bounds: new Box3(entry.bounds.min.clone().multiplyScalar(scale).add(shift), entry.bounds.max.clone().multiplyScalar(scale).add(shift)) }));
    const offsets = planExplosion(transformed, bodies);
    separated(transformed, offsets);
    for (const entry of entries) near(offsets.get(entry.part.id), expected.get(entry.part.id).clone().multiplyScalar(scale), Math.max(1, scale) * 1e-9);
  }
});

test('parent and child assemblies stay clear after their internal parts expand', () => {
  const entries = [
    part('root', [0, 0, 0], [.04, .04, .03], 'structure', 'root', 'trunk'),
    part('upper-core', [0, 0, .025], [.03, .03, .03], 'actuator', 'upper', 'upper'),
    part('upper-bearing', [0, 0, .035], [.02, .02, .004], 'bearing', 'upper', 'upper'),
    part('head-core', [0, 0, .05], [.03, .03, .03], 'structure', 'head', 'upper'),
    part('head-cover', [0, 0, .05], [.05, .05, .05], 'shell', 'head', 'upper'),
  ];
  const bodies = [body('head', 'upper'), body('upper', 'root'), body('root')];
  separated(entries, planExplosion(entries, bodies));
});

test('mirrored limb assemblies receive mirrored offsets', () => {
  const entries = [
    part('root', [0, 0, 0], [.03, .03, .03], 'structure', 'root', 'trunk'),
    part('limb-core', [0, .025, -.01], [.025, .025, .025], 'actuator', 'limb', 'limb'),
    part('limb-plate', [0, .017, -.01], [.02, .002, .02], 'structure', 'limb', 'limb'),
    part('limb-bearing', [0, .04, -.01], [.015, .003, .015], 'bearing', 'limb', 'limb'),
  ];
  const mirrored = entries.map(entry => ({ ...entry, bounds: new Box3(new Vector3(entry.bounds.min.x, -entry.bounds.max.y, entry.bounds.min.z), new Vector3(entry.bounds.max.x, -entry.bounds.min.y, entry.bounds.max.z)) }));
  const bodies = [body('root'), body('limb', 'root')];
  const left = planExplosion(entries, bodies), right = planExplosion(mirrored, bodies);
  separated(entries, left); separated(mirrored, right);
  for (const entry of entries) { const offset = left.get(entry.part.id).clone(); offset.y *= -1; near(right.get(entry.part.id), offset); }
});

test('a lower-leg motor keeps its height relative to its long mounting link', () => {
  const entries = [
    part('motor', [0, .01, -.015], [.02, .029, .034], 'actuator'),
    part('link', [0, 0, 0], [.02, .008, .058]),
  ];
  const offsets = planExplosion(entries, [body('core')]);
  separated(entries, offsets);
  assert.equal(offsets.get('motor').z, offsets.get('link').z);
  assert.equal(offsets.get('motor').x, offsets.get('link').x);
  assert.ok(offsets.get('link').y < offsets.get('motor').y);
});

test('the ankle, foot and sole remain in one vertical stack throughout expansion', () => {
  const entries = [
    part('ankle', [0, 0, 0], [.0365, .0395, .0255]),
    part('foot', [.0035, -.0001, -.011], [.054, .0401, .0169]),
    part('sole', [.0035, .0001, -.015], [.054, .0411, .0129]),
    part('bearing', [0, -.016, .0036], [.015, .003, .015], 'bearing'),
  ];
  const offsets = planExplosion(entries, [body('core')]);
  separated(entries, offsets);
  assert.ok(offsets.get('sole').z < offsets.get('foot').z);
  assert.ok(offsets.get('foot').z < offsets.get('ankle').z);
  for (const amount of [.25, .5, .75, 1]) {
    const [ankle, foot, sole] = entries.map(entry => entry.bounds.getCenter(new Vector3()).addScaledVector(offsets.get(entry.part.id), amount));
    assert.ok(ankle.z > foot.z && foot.z > sole.z);
    assert.ok(Math.abs(ankle.x - foot.x) < .004);
    assert.ok(Math.abs(foot.x - sole.x) < 1e-10);
    assert.ok(Math.abs(ankle.y - foot.y) < .001);
    assert.ok(Math.abs(foot.y - sole.y) < .001);
  }
});

test('a child follows the displaced parent bearing along the joint axis in world space', () => {
  const entries = [
    part('motor', [0, 0, 0], [.03, .02, .03], 'actuator', 'parent'),
    part('plate', [.015, 0, 0], [.003, .035, .035], 'structure', 'parent'),
    part('bearing', [.019, 0, 0], [.004, .022, .022], 'bearing', 'parent'),
    part('child', [.026, 0, 0], [.01, .01, .01], 'structure', 'child'),
  ];
  const bodies = [body('parent'), body('child', 'parent', [.021, 0, 0], [0, Math.SQRT1_2, 0, Math.SQRT1_2])];
  const offsets = planExplosion(entries, bodies, [{ body: 'child', axis: [0, 0, 1] }]);
  separated(entries, offsets);
  assert.ok(offsets.get('bearing').x > 0);
  assert.ok(offsets.get('child').x >= offsets.get('bearing').x);
  assert.ok(Math.abs(offsets.get('child').y) < 1e-10);
  assert.ok(Math.abs(offsets.get('child').z) < 1e-10);
});

test('empty, single-part and missing-body-metadata layouts are finite and deterministic', () => {
  assert.equal(planExplosion([], []).size, 0);
  const single = part('single', [0, 0, 0], [.01, .02, .03]);
  near(planExplosion([single], []).get('single'), new Vector3());
  const entries = nested().map((entry, i) => ({ ...entry, part: { ...entry.part, body: `unknown-${i}` } }));
  const offsets = planExplosion(entries, []), reversed = planExplosion([...entries].reverse(), []);
  separated(entries, offsets);
  for (const entry of entries) near(offsets.get(entry.part.id), reversed.get(entry.part.id));
});
