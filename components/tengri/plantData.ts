export type PlantZone = {
  id: string;
  label: string;
  file: string;
  format: number;
  bounds: [number, number, number, number, number, number];
  segments: number;
  bytes: number;
  surface: { file: string; vertices: number; triangles: number; bytes: number };
};
export type PlantManifest = { name: string; source: string; zones: PlantZone[]; bounds: PlantZone["bounds"] };

/** Restore the source's shared world coordinates from the compact feature edges. */
export function decodePlantZone(buffer: ArrayBuffer, zone: PlantZone): Float32Array {
  const header = new DataView(buffer);
  if (buffer.byteLength < 16 || header.getUint32(0, true) !== 0x544e4752 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== zone.segments || buffer.byteLength !== 16 + zone.segments * 12) {
    throw new Error(`Invalid geometry for ${zone.label}`);
  }
  const packed = new Uint16Array(buffer, 16);
  const positions = new Float32Array(packed.length);
  for (let index = 0; index < packed.length; index++) {
    const axis = index % 3;
    positions[index] = zone.bounds[axis] + packed[index] / 65535 * (zone.bounds[axis + 3] - zone.bounds[axis]);
  }
  return positions;
}

export function decodePlantSurface(buffer: ArrayBuffer, zone: PlantZone) {
  const header = new DataView(buffer);
  if (buffer.byteLength < 16 || header.getUint32(0, true) !== 0x54534752 || header.getUint32(4, true) !== 1) throw new Error(`Invalid surface for ${zone.label}`);
  const vertices = header.getUint32(8, true), indexCount = header.getUint32(12, true);
  const indexOffset = Math.ceil((16 + vertices * 6) / 4) * 4;
  if (vertices !== zone.surface.vertices || indexCount !== zone.surface.triangles * 3 || buffer.byteLength !== indexOffset + indexCount * 4) throw new Error(`Incomplete surface for ${zone.label}`);
  const packed = new Uint16Array(buffer, 16, vertices * 3), positions = new Float32Array(vertices * 3);
  for (let i = 0; i < packed.length; i++) { const axis = i % 3; positions[i] = zone.bounds[axis] + packed[i] / 65535 * (zone.bounds[axis + 3] - zone.bounds[axis]); }
  const indices = new Uint32Array(buffer, indexOffset, indexCount);
  return zone.id === "Infrastructure" ? separateRoadLayers(positions, indices) : { positions, indices };
}

/** The Falcon asset places its road beds and road details on the same 4 cm plane. */
function separateRoadLayers(positions: Float32Array, indices: Uint32Array) {
  const roadFaces: number[] = [];
  const roadVertices = new Map<number, number>();
  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face] * 3, b = indices[face + 1] * 3, c = indices[face + 2] * 3;
    const ay = positions[a + 1], by = positions[b + 1], cy = positions[c + 1];
    if (Math.abs(ay - .04) > .001 || Math.abs(by - ay) > .00001 || Math.abs(cy - ay) > .00001) continue;
    const normalY = (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a])
      - (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
    // The large downward-facing triangles are the road beds; upward faces are the detail layer.
    if (normalY >= -.01) continue;
    roadFaces.push(face);
    for (let corner = 0; corner < 3; corner++) {
      const original = indices[face + corner];
      if (!roadVertices.has(original)) roadVertices.set(original, positions.length / 3 + roadVertices.size);
    }
  }
  if (!roadFaces.length) return { positions, indices };
  const separated = new Float32Array(positions.length + roadVertices.size * 3);
  separated.set(positions);
  for (const [original, replacement] of roadVertices) {
    separated.set(positions.subarray(original * 3, original * 3 + 3), replacement * 3);
    separated[replacement * 3 + 1] -= .015;
  }
  const faces = indices.slice();
  for (const face of roadFaces) for (let corner = 0; corner < 3; corner++) {
    faces[face + corner] = roadVertices.get(indices[face + corner])!;
  }
  return { positions: separated, indices: faces };
}
