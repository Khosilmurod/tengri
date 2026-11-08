import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { decodePlantSurface } from '../components/tengri/plantData.ts';

const assets = new URL('../public/tengri/plant/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', assets), 'utf8'));

async function read(zone) {
  const bytes = gunzipSync(await fs.readFile(new URL(zone.surface.file, assets)));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const header = new DataView(buffer), count = header.getUint32(8, true);
  const packed = new Uint16Array(buffer, 16, count * 3);
  const positions = Float32Array.from(packed, (value, i) => {
    const axis = i % 3;
    return zone.bounds[axis] + value / 65535 * (zone.bounds[axis + 3] - zone.bounds[axis]);
  });
  const indices = new Uint32Array(buffer, Math.ceil((16 + count * 6) / 4) * 4, header.getUint32(12, true));
  return { buffer, raw: { positions, indices } };
}

function roadHeights({ positions: p, indices }, x, z) {
  const heights = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    if (p[a + 1] > .1 || p[a + 1] < 0 || Math.abs(p[a + 1] - p[b + 1]) > .00001 || Math.abs(p[a + 1] - p[c + 1]) > .00001) continue;
    const vx = p[b] - p[a], vz = p[b + 2] - p[a + 2], wx = p[c] - p[a], wz = p[c + 2] - p[a + 2];
    const determinant = vx * wz - vz * wx;
    if (Math.abs(determinant) < .000001) continue;
    const dx = x - p[a], dz = z - p[a + 2];
    const u = (dx * wz - dz * wx) / determinant, v = (vx * dz - vz * dx) / determinant;
    if (u > .000001 && v > .000001 && u + v < .999999) heights.push(p[a + 1]);
  }
  return heights.sort((a, b) => a - b);
}

const zone = manifest.zones.find(zone => zone.id === 'Infrastructure');
const { buffer, raw } = await read(zone);
const sourceCopy = new Uint8Array(buffer).slice();
const repaired = decodePlantSurface(buffer, zone);
assert.deepEqual(new Uint8Array(buffer), sourceCopy, 'Decoding must preserve the source asset');
assert.equal(repaired.indices.length, raw.indices.length, 'The road faces must remain present');
assert.deepEqual(repaired.positions.subarray(0, raw.positions.length), raw.positions, 'Other infrastructure vertices must stay in place');
for (const [x, z] of [[0, 90], [0, 54], [-67, 0]]) {
  const before = roadHeights(raw, x, z), after = roadHeights(repaired, x, z);
  assert.equal(before.length, 2, 'Probe must reproduce overlapping source road faces');
  assert.equal(before[0], before[1], 'Source road layers must overlap at the probe');
  assert.equal(after.length, 2, 'Both road and detail layers must be retained');
  assert.ok(after[1] - after[0] > .01 && after[1] - after[0] < .02, 'Road bed must be visibly separated in depth');
  assert.equal(after[1], before[1], 'The road detail layer must keep its position');
}

const other = manifest.zones.find(zone => zone.id === 'SouthWest');
const otherSource = await read(other), otherResult = decodePlantSurface(otherSource.buffer, other);
assert.deepEqual(otherResult.positions, otherSource.raw.positions, 'Other plant sections must be unaffected');
assert.deepEqual(otherResult.indices, otherSource.raw.indices, 'Other plant sections must keep their topology');
console.log('Road geometry passed: overlapping road faces separated; detail, equipment, source data, and other sections preserved.');
