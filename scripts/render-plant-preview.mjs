import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import sharp from 'sharp';
import { decodePlantZone } from '../components/tengri/plantData.ts';

const root = new URL('../public/tengri/plant/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
const width = 1600, height = 1000;
const focus = process.argv[3];
const bounds = manifest.zones.find(zone => zone.id === focus)?.bounds || manifest.bounds;
const box = new THREE.Box3(new THREE.Vector3(...bounds.slice(0, 3)), new THREE.Vector3(...bounds.slice(3)));
const center = box.getCenter(new THREE.Vector3());
const camera = new THREE.OrthographicCamera(-200, 200, 125, -125, .1, 3000);
camera.position.copy(center).add(new THREE.Vector3(1, .85, 1).normalize().multiplyScalar(box.getSize(new THREE.Vector3()).length() * 2.5));
camera.lookAt(center); camera.updateMatrixWorld();
const projected = new THREE.Box3();
for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
const size = projected.getSize(new THREE.Vector3()), span = Math.max(size.y, size.x / (width / height)) * 1.19;
camera.left = -span / 2 * width / height; camera.right = -camera.left; camera.top = span / 2; camera.bottom = -camera.top; camera.updateProjectionMatrix();
const vector = new THREE.Vector3();
function point(x, y, z) { vector.set(x, y, z).project(camera); return `${((vector.x + 1) / 2 * width).toFixed(1)},${((1-vector.y) / 2 * height).toFixed(1)}`; }
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#030a10"/>`;
let grid = '';
for (let i=-140; i<=140; i+=5) grid += `M${point(i,box.min.y-.3,-140)}L${point(i,box.min.y-.3,140)}M${point(-140,box.min.y-.3,i)}L${point(140,box.min.y-.3,i)}`;
svg += `<path d="${grid}" stroke="#172d3a" stroke-opacity=".35" stroke-width="1" fill="none"/>`;
let segments = 0, bytes = 0;
for (const zone of manifest.zones) {
  const packed = await fs.readFile(new URL(zone.file, root));
  assert.equal(packed.length, zone.bytes);
  const unpacked = gunzipSync(packed);
  const positions = decodePlantZone(unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength), zone);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  assert(geometry.boundingBox.max.y - geometry.boundingBox.min.y > 5, `${zone.id} retains real height`);
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial());
  lines.updateMatrixWorld();
  const midpoint = new THREE.Vector3().fromArray(positions).add(new THREE.Vector3().fromArray(positions, 3)).multiplyScalar(.5).project(camera);
  const raycaster = new THREE.Raycaster(); raycaster.params.Line.threshold = .005;
  raycaster.setFromCamera(new THREE.Vector2(midpoint.x, midpoint.y), camera);
  assert(raycaster.intersectObject(lines).length > 0, `${zone.id} is selectable in 3D`);
  geometry.dispose(); lines.material.dispose();
  let path = '';
  for (let i=0; i<positions.length; i+=3) {
    for (let axis=0; axis<3; axis++) {
      assert(Number.isFinite(positions[i+axis]));
      assert(positions[i+axis] >= zone.bounds[axis] - .001 && positions[i+axis] <= zone.bounds[axis+3] + .001);
    }
    path += `${i%6===0?'M':'L'}${point(positions[i],positions[i+1],positions[i+2])}`;
  }
  if (!focus || focus === zone.id) svg += `<path d="${path}" fill="none" stroke="${focus?'#d5f3ff':'#78b1c7'}" stroke-opacity="${focus?.85:zone.id==='Infrastructure'?.28:.52}" stroke-width=".8"/>`;
  segments += zone.segments; bytes += packed.length;
}
svg += '</svg>';
const output = process.argv[2] || '/tmp/tengri-plant-preview.png';
await sharp(Buffer.from(svg), { limitInputPixels: false }).png().toFile(output);
assert.equal(manifest.zones.length, 16);
console.log(JSON.stringify({ output, zones: manifest.zones.length, segments, bytes, bounds: manifest.bounds, status: 'All geometry decoded, finite, within source bounds, with real height and successful 3D raycast selection' }));
