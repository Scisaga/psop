import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { prepareSourceDisplayNormals, setSourceFacetShading } from '../src/source-display-normals.ts';

const geometry = vertices => new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices.flat(2), 3));
const vector = (attribute, i) => [attribute.getX(i), attribute.getY(i), attribute.getZ(i)];

test('display shading preserves source coordinates and facet-to-vertex identity', () => {
  const source = geometry([
    [[0, 0, 0], [.002, 0, 0], [0, .002, 0]],
    [[0, .002, 0], [.002, 0, 0], [.002, .002, .0002]],
  ]);
  const attribute = source.getAttribute('position');
  const bytes = Buffer.from(attribute.array.buffer).toString('hex');
  prepareSourceDisplayNormals(source);
  assert.strictEqual(source.getAttribute('position'), attribute);
  assert.equal(Buffer.from(attribute.array.buffer).toString('hex'), bytes);
  assert.equal(source.index, null);
  assert.equal(source.userData.sourceDisplayMapping.sourceFacetCount, 2);
  const display = source.getAttribute('normal');
  setSourceFacetShading(source, true);
  const facet = source.getAttribute('normal');
  assert.notStrictEqual(facet, display);
  assert.deepEqual(vector(facet, 0), vector(facet, 1));
  setSourceFacetShading(source, false);
  assert.strictEqual(source.getAttribute('normal'), display);
});

test('a 90-degree corner and opposite source faces keep their own normals', () => {
  const source = geometry([
    [[0, 0, 0], [.001, 0, 0], [0, .001, 0]],
    [[.001, 0, 0], [0, 0, 0], [0, 0, .001]],
    [[0, .001, 0], [.001, 0, 0], [0, 0, 0]],
  ]);
  prepareSourceDisplayNormals(source);
  const normal = source.getAttribute('normal');
  assert.deepEqual(vector(normal, 0), [0, 0, 1]);
  assert.deepEqual(vector(normal, 4), [0, 1, 0]);
  assert.deepEqual(vector(normal, 8), [0, 0, -1]);
});

test('cylinder tessellation shades continuously without smoothing across disconnected shells', () => {
  const faces = [];
  const step = Math.PI / 12;
  const point = (angle, z) => [Math.cos(angle) * .002, Math.sin(angle) * .002, z];
  for (let i = -1; i <= 1; i += 1) {
    const a = i * step, b = (i + 1) * step;
    faces.push([point(a, 0), point(b, 0), point(a, .003)]);
    faces.push([point(b, 0), point(b, .003), point(a, .003)]);
  }
  // This tilted triangle touches only one point, with no shared edge. It must
  // not blend into the cylinder's source fan even though its normal is close.
  faces.push([point(0, 0), [.002, -.001, -.001], [.0025, -.001, 0]]);
  const source = geometry(faces);
  prepareSourceDisplayNormals(source);
  const normal = source.getAttribute('normal');
  const smoothA = vector(normal, 1), smoothB = vector(normal, 6);
  smoothA.forEach((value, i) => assert.ok(Math.abs(value - smoothB[i]) < 1e-6));
  assert.ok(Math.abs(smoothA[0] - 1) < .0001);
  assert.ok(Math.abs(smoothA[1]) < .0001);
  for (let i = 0; i < normal.count; i += 1) assert.ok(vector(normal, i).every(Number.isFinite));
  setSourceFacetShading(source, true);
  assert.deepEqual(vector(normal, 18), vector(source.getAttribute('normal'), 18));
});
