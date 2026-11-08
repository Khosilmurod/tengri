import fs from 'node:fs/promises';
import { inflateRawSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

await MeshoptSimplifier.ready;
const root = new URL('../public/tengri/plant/', import.meta.url);
const catalog = JSON.parse(await fs.readFile(new URL('./plant-archive-index.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
const source = 'https://github.com/StefanJohnsen/FalconGasProcessingPlant/releases/download/glb/FalconGasPlant.glb.zip';

function readAccessor(document, binary, id) {
  const a = document.accessors[id], v = document.bufferViews[a.bufferView];
  const Ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const size = { SCALAR: 1, VEC3: 3 }[a.type];
  if (v.byteStride && v.byteStride !== size * Ctor.BYTES_PER_ELEMENT) throw Error('Unexpected interleaved input');
  return new Ctor(binary.buffer, binary.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * size);
}
function combine(arrays, Ctor) {
  const result = new Ctor(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0; for (const array of arrays) { result.set(array, offset); offset += array.length; } return result;
}
function compact(positions, indices) {
  const [remap, count] = MeshoptSimplifier.compactMesh(indices);
  const result = new Float32Array(count * 3);
  for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) result.set(positions.subarray(i * 3, i * 3 + 3), remap[i] * 3);
  return { positions: result, indices };
}

for (const zone of manifest.zones) {
  const metadataPath = new URL(`${zone.id}.surface.json`, root);
  try {
    const cached = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    if (cached.method !== 'solid-lod-v1') throw Error('Outdated');
    zone.surface = cached; console.log(`Reused ${zone.id}`); continue;
  } catch {}
  const space = await fs.statfs(root);
  if (space.bavail * space.bsize < 105 * 1024 * 1024) throw Error('Stopped to retain 105 MB free space');
  const entry = catalog.find(item => item.name === zone.sourceFile);
  console.log(`Preparing solid geometry: ${zone.id}`);
  const response = await fetch(source, { headers: { Range: `bytes=${entry.offset}-${entry.offset + entry.compressed + 512}` } });
  if (response.status !== 206) { await response.body?.cancel(); throw Error('Expected a partial response'); }
  const zipped = Buffer.from(await response.arrayBuffer());
  const start = 30 + zipped.readUInt16LE(26) + zipped.readUInt16LE(28);
  const bytes = inflateRawSync(zipped.subarray(start, start + entry.compressed));
  if (createHash('sha256').update(bytes).digest('hex') !== zone.sourceSha256) throw Error('Source changed');
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  const cache = new Map(), positions = [], indices = [];
  let offset = 0;

  function prepare(id) {
    if (cache.has(id)) return cache.get(id);
    const parts = [];
    for (const primitive of document.meshes[id].primitives) {
      if (primitive.mode !== undefined && primitive.mode !== 4) continue;
      const a = document.accessors[primitive.attributes.POSITION];
      if (a.min) {
        const dimensions = a.max.map((v, i) => v - a.min[i]).sort((a, b) => b - a);
        if (dimensions[0] < .6 || dimensions[1] < .12) continue;
      }
      const raw = readAccessor(document, binary, primitive.attributes.POSITION);
      const sourceIndices = primitive.indices === undefined ? Uint32Array.from({ length: raw.length / 3 }, (_, i) => i) : readAccessor(document, binary, primitive.indices);
      const remap = MeshoptSimplifier.generatePositionRemap(raw, 3);
      const welded = Uint32Array.from(sourceIndices, i => remap[i]);
      const target = Math.min(welded.length, Math.max(36, Math.floor(welded.length * .008 / 3) * 3));
      let simplified = MeshoptSimplifier.simplify(welded, raw, 3, target, .03, ['Prune', 'Permissive'])[0];
      if (simplified.length > Math.max(768, target * 3)) simplified = MeshoptSimplifier.simplifySloppy(welded, raw, 3, null, Math.max(144, target), .06)[0];
      if (simplified.length) parts.push(compact(raw, simplified));
    }
    cache.set(id, parts); return parts;
  }
  function visit(id, parent, path = []) {
    const node = document.nodes[id], matrix = new THREE.Matrix4();
    if (node.matrix) matrix.fromArray(node.matrix);
    else matrix.compose(new THREE.Vector3(...(node.translation || [0, 0, 0])), new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(node.scale || [1, 1, 1])));
    matrix.premultiply(parent);
    const names = [...path, node.name || ''];
    if (node.mesh !== undefined && !/anchor bolt|hex bolt|washer|screw|thread|bolt head|number plate|licence plate|logo|brand text/i.test(names.join(' / '))) {
      for (const part of prepare(node.mesh)) {
        const transformed = new THREE.BufferAttribute(part.positions.slice(), 3).applyMatrix4(matrix).array;
        positions.push(transformed);
        const faces = Uint32Array.from(part.indices, i => i + offset);
        if (matrix.determinant() < 0) for (let i = 0; i < faces.length; i += 3) [faces[i], faces[i + 2]] = [faces[i + 2], faces[i]];
        indices.push(faces); offset += transformed.length / 3;
      }
    }
    for (const child of node.children || []) visit(child, matrix, names);
  }
  for (const node of document.scenes[document.scene || 0].nodes) visit(node, new THREE.Matrix4());
  let combined = combine(positions, Float32Array), faces = combine(indices, Uint32Array);
  if (faces.length > 240000) faces = MeshoptSimplifier.simplifySloppy(faces, combined, 3, null, 240000, .004)[0];
  if (faces.length > 360000) throw Error('Surface exceeded the triangle budget');
  const clean = compact(combined, faces);
  const packed = new Uint16Array(clean.positions.length);
  for (let i = 0; i < packed.length; i++) {
    const axis = i % 3;
    packed[i] = Math.round((clean.positions[i] - zone.bounds[axis]) / (zone.bounds[axis + 3] - zone.bounds[axis]) * 65535);
  }
  const padding = Buffer.alloc((4 - packed.byteLength % 4) % 4);
  const header = new Uint32Array([0x54534752, 1, packed.length / 3, clean.indices.length]);
  const output = gzipSync(Buffer.concat([Buffer.from(header.buffer), Buffer.from(packed.buffer), padding, Buffer.from(clean.indices.buffer)]), { level: 9 });
  if (output.length > 2 * 1024 * 1024) throw Error('Surface exceeded the 2 MB file budget');
  const metadata = { method: 'solid-lod-v1', file: `${zone.id}.surface.bin.gz`, vertices: packed.length / 3, triangles: clean.indices.length / 3, bytes: output.length };
  await fs.writeFile(new URL(metadata.file, root), output);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  zone.surface = metadata;
  console.log(`${zone.id}: ${metadata.triangles.toLocaleString()} triangles, ${(output.length / 1024).toFixed(0)} KB`);
  cache.clear(); if (global.gc) global.gc();
}
await fs.writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ sections: manifest.zones.length, triangles: manifest.zones.reduce((n, z) => n + z.surface.triangles, 0), bytes: manifest.zones.reduce((n, z) => n + z.surface.bytes, 0) }));
