import fs from 'node:fs/promises';
import { inflateRawSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

await MeshoptSimplifier.ready;
const source = 'https://github.com/StefanJohnsen/FalconGasProcessingPlant/releases/download/glb/FalconGasPlant.glb.zip';
const catalog = JSON.parse(await fs.readFile(new URL('./plant-archive-index.json', import.meta.url), 'utf8'));
const root = new URL('../public/tengri/plant/', import.meta.url);
const entries = catalog.filter(file => file.name !== 'FalconGasPlant.glb');
const manifest = { name: 'Falcon Gas Processing Plant', creator: 'Stefan Johnsen', license: 'CC0-1.0', source: 'https://github.com/StefanJohnsen/FalconGasProcessingPlant', description: 'A complete fictional industrial plant published as an open 3D reference dataset. Optimized for web display; not a surveyed Tengri site.', zones: [] };

function readAccessor(document, binary, accessorId) {
  const accessor = document.accessors[accessorId];
  const view = document.bufferViews[accessor.bufferView];
  const Ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[accessor.componentType];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const offset = binary.byteOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  if (view.byteStride && view.byteStride !== size * Ctor.BYTES_PER_ELEMENT) throw Error('Interleaved source is not supported');
  return new Ctor(binary.buffer, offset, accessor.count * size);
}
function join(arrays, Ctor) {
  const result = new Ctor(arrays.reduce((sum,a) => sum + a.length, 0));
  let offset = 0; for (const array of arrays) { result.set(array, offset); offset += array.length; }
  return result;
}


function featureEdges(positions, indices) {
  const vertexCount=positions.length/3;
  const edges=new Map(), result=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
  const threshold=Math.cos(18*Math.PI/180);
  function emit(i,j){result.push(...positions.subarray(i*3,i*3+3),...positions.subarray(j*3,j*3+3));}
  for(let i=0;i<indices.length;i+=3){
    const tri=[indices[i],indices[i+1],indices[i+2]];
    a.fromArray(positions,tri[0]*3);b.fromArray(positions,tri[1]*3);c.fromArray(positions,tri[2]*3);
    normal.subVectors(b,a).cross(c.sub(a)).normalize();
    for(let j=0;j<3;j++){
      const u=tri[j],v=tri[(j+1)%3];const key=Math.min(u,v)*vertexCount+Math.max(u,v);
      const previous=edges.get(key);
      if(previous){
        const sharp=normal.x*previous[2]+normal.y*previous[3]+normal.z*previous[4]<threshold;
        // Orthogonal contours keep smooth tanks, domes and pipes readable in a wire blueprint.
        const contour=normal.x*previous[2]<-1e-9 || normal.y*previous[3]<-1e-9 || normal.z*previous[4]<-1e-9;
        if(sharp||contour)emit(u,v);
        edges.delete(key);
      }
      else edges.set(key,[u,v,normal.x,normal.y,normal.z]);
    }
  }
  for(const e of edges.values())emit(e[0],e[1]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(result,3));return geometry;
}

for (const entry of entries) {
  const id = entry.name.replace('FalconGasPlant-', '').replace('.glb','');
  if (process.argv[2] && process.argv[2] !== id) continue;
  const path = new URL(`${id}.json`, root);
  const space=await fs.statfs(root);
  if(space.bavail*space.bsize<150*1024*1024)throw Error('Stopped to preserve 150 MB of free disk space');
  try { const existing=JSON.parse(await fs.readFile(path,'utf8')); if(existing.format!==2||existing.edgeMethod!=='feature-and-axis-contours')throw Error('Rebuild older format'); manifest.zones.push(existing); console.log(`Reused ${id}`); continue; } catch {}
  console.log(`Downloading ${id} (${Math.round(entry.compressed/1024/1024)} MB source)...`);
  // Range fetches avoid downloading/storing the duplicate full-plant archive.
  const response = await fetch(source, { headers: { Range: `bytes=${entry.offset}-${entry.offset + entry.compressed + 512}` } });
  if(response.status !== 206) { await response.body?.cancel(); throw Error(`Expected a byte range, got ${response.status}`); }
  const zip = Buffer.from(await response.arrayBuffer());
  const start = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
  const bytes = inflateRawSync(zip.subarray(start, start + entry.compressed));
  if(bytes.readUInt32LE(0) !== 0x46546c67 || bytes.length !== entry.bytes) throw Error(`Invalid GLB ${id}`);
  const jsonLength=bytes.readUInt32LE(12);
  const document=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  const binary=bytes.subarray(28+jsonLength);
  const positions=[], indices=[], lines=[];
  const box=new THREE.Box3();
  let vertexOffset=0, sourceTriangles=0, triangles=0, objects=0;
  const cache=new Map();
  const notable=[];

  function prepare(meshId) {
    if(cache.has(meshId)) return cache.get(meshId);
    const result=[];
    for(const primitive of document.meshes[meshId].primitives) {
      if(primitive.mode !== undefined && primitive.mode !== 4) continue;
      const accessor=document.accessors[primitive.attributes.POSITION];
      if(accessor.min && Math.max(...accessor.max.map((v,i)=>v-accessor.min[i]))<.18)continue;
      const raw=readAccessor(document,binary,primitive.attributes.POSITION);
      const sourceIndices=primitive.indices !== undefined ? readAccessor(document,binary,primitive.indices) : Uint32Array.from({length:raw.length/3},(_,i)=>i);
      sourceTriangles += sourceIndices.length/3;
      const geometry=new THREE.BufferGeometry();
      const remap=MeshoptSimplifier.generatePositionRemap(raw,3);
      const welded=Uint32Array.from(sourceIndices,index=>remap[index]);
      const target=Math.min(welded.length,Math.max(36,Math.floor(welded.length*.025/3)*3));
      let simplified=MeshoptSimplifier.simplify(welded,raw,3,target,.025,['Prune'])[0];
      const [compact,count]=MeshoptSimplifier.compactMesh(simplified);
      const clean=new Float32Array(count*3);
      for(let i=0;i<compact.length;i++) if(compact[i]!==0xffffffff) clean.set(raw.subarray(i*3,i*3+3),compact[i]*3);
      geometry.setAttribute('position',new THREE.BufferAttribute(clean,3));
      geometry.setIndex(new THREE.BufferAttribute(simplified,1));
      const edges=featureEdges(clean,simplified);
      result.push({ geometry, edges });
    }
    cache.set(meshId,result); return result;
  }

  function visit(index,parent,path=[]) {
    const node=document.nodes[index];
    const matrix=new THREE.Matrix4();
    if(node.matrix)matrix.fromArray(node.matrix);
    else matrix.compose(new THREE.Vector3(...(node.translation||[0,0,0])),new THREE.Quaternion(...(node.rotation||[0,0,0,1])),new THREE.Vector3(...(node.scale||[1,1,1])));
    matrix.premultiply(parent);
    const names=[...path,node.name||''];
    if(node.mesh!==undefined) {
      const name=names.join(' / ');
      // Sub-centimeter fastening/text geometry contributes noise at site scale.
      if(!/anchor bolt|hex bolt|washer|screw|thread|bolt head|number plate|licence plate|logo|brand text/i.test(name)) {
        for(const part of prepare(node.mesh)) {
          const pos=part.geometry.attributes.position.clone().applyMatrix4(matrix).array;
          const edge=part.edges.attributes.position.clone().applyMatrix4(matrix).array;
          const ix=Uint32Array.from(part.geometry.index.array,value=>value+vertexOffset);
          lines.push(edge); vertexOffset+=pos.length/3; triangles+=ix.length/3;
          const localBox=new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(pos,3)); box.union(localBox);
          const size=localBox.getSize(new THREE.Vector3());
          if(Math.max(size.x,size.y,size.z)>4 && objects%8===0)notable.push({name:node.name,bounds:[...localBox.min.toArray(),...localBox.max.toArray()]});
          objects++;
        }
      }
    }
    for(const child of node.children||[]) visit(child,matrix,names);
  }
  for(const node of document.scenes[document.scene||0].nodes) visit(node,new THREE.Matrix4());
  const allLines=join(lines,Float32Array);
  const candidates=[];
  for(let i=0;i<allLines.length;i+=6){
    const length=Math.hypot(allLines[i]-allLines[i+3],allLines[i+1]-allLines[i+4],allLines[i+2]-allLines[i+5]);
    if(length>=.085)candidates.push({i,length});
  }
  // A strict geometry budget retains the largest structural edges in every zone.
  if(candidates.length>80000)candidates.sort((a,b)=>b.length-a.length);
  const kept=candidates.slice(0,80000);kept.sort((a,b)=>a.i-b.i);
  const quantized=new Uint16Array(kept.length*6);
  const minimum=box.min.toArray(),size=box.getSize(new THREE.Vector3()).toArray();
  for(let n=0;n<kept.length;n++)for(let j=0;j<6;j++)quantized[n*6+j]=Math.round((allLines[kept[n].i+j]-minimum[j%3])/size[j%3]*65535);
  const header=new Uint32Array([0x544e4752,2,kept.length,0]);
  const compressed=gzipSync(Buffer.concat([Buffer.from(header.buffer),Buffer.from(quantized.buffer)]),{level:9});
  // 16 areas × 80,000 edges × 12 bytes bounds all model geometry below 16 MB raw.
  if(compressed.length>1024*1024)throw Error('Zone exceeds the 1 MB disk budget');
  await fs.writeFile(new URL(`${id}.bin.gz`,root),compressed);
  const metadata={id,label:id.replace(/([a-z])([A-Z])/g,'$1 $2'),format:2,edgeMethod:'feature-and-axis-contours',file:`${id}.bin.gz`,bounds:[...box.min.toArray(),...box.max.toArray()],objects,sourceTriangles,triangles,segments:kept.length,bytes:compressed.length,sourceFile:entry.name,sourceSha256:createHash('sha256').update(bytes).digest('hex')};
  await fs.writeFile(path,JSON.stringify(metadata,null,2));
  manifest.zones.push(metadata);
  cache.forEach(parts=>parts.forEach(part=>{part.geometry.dispose();part.edges.dispose();}));
  console.log(`${id}: ${sourceTriangles.toLocaleString()} → ${triangles.toLocaleString()} triangles, ${kept.length.toLocaleString()} edges, ${(compressed.length/1024/1024).toFixed(1)} MB`);
  if(global.gc)global.gc();
}
const bounds=new THREE.Box3();
for(const zone of manifest.zones)bounds.union(new THREE.Box3(new THREE.Vector3(...zone.bounds.slice(0,3)),new THREE.Vector3(...zone.bounds.slice(3))));
manifest.bounds=[...bounds.min.toArray(),...bounds.max.toArray()];
manifest.triangles=manifest.zones.reduce((n,z)=>n+z.triangles,0);
manifest.segments=manifest.zones.reduce((n,z)=>n+z.segments,0);
if(manifest.zones.length===entries.length)await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(`COMPLETE: ${manifest.zones.length} zones, ${manifest.triangles.toLocaleString()} triangles, ${manifest.segments.toLocaleString()} lines.`);
