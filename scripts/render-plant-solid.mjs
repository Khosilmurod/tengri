import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import * as THREE from 'three';
import { decodePlantZone, decodePlantSurface } from '../components/tengri/plantData.ts';
import { fitPlantCamera, plantStoryPose, boundsBox } from '../components/tengri/plantCamera.ts';
import { plantArt } from '../components/tengri/plantArt.ts';

const root = new URL('../public/tengri/plant/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
const mode = process.argv[2] || 'overview';
const detail = mode === 'detail';
const presentation = mode === 'top' || mode === 'front' ? mode : 'iso';
const width = detail ? 1800 : 1600, height = detail ? 1200 : 1000;
const renderZones = detail ? manifest.zones.filter(zone => zone.id === 'CentralEast') : manifest.zones;
const pose = detail ? fitPlantCamera(boundsBox(renderZones[0].bounds), new THREE.Vector3(-1.4,.55,1.5), width, height) : plantStoryPose(manifest, mode === 'overview' || presentation !== 'iso' ? 0 : Number(mode), width, height, presentation);
if (detail) pose.span *= .84;
const camera = new THREE.OrthographicCamera(-pose.span/2*width/height, pose.span/2*width/height, pose.span/2, -pose.span/2, .1, 3000);
camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
const pixels = Buffer.alloc(width*height*3), depth = new Float32Array(width*height); depth.fill(Infinity);
const vector = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
const light = new THREE.Vector3(...plantArt.keyPosition).normalize(), fill = new THREE.Vector3(...plantArt.rimPosition).normalize();
const base = [(plantArt.surface>>16)&255,(plantArt.surface>>8)&255,plantArt.surface&255];
const edge = [(plantArt.edge>>16)&255,(plantArt.edge>>8)&255,plantArt.edge&255];
const towardsCamera = camera.position.clone().sub(pose.target).normalize();
function project(positions) {
  const result = new Float32Array(positions.length);
  for(let i=0;i<positions.length;i+=3) { vector.fromArray(positions,i).project(camera); result[i]=(vector.x+1)*width/2; result[i+1]=(1-vector.y)*height/2; result[i+2]=vector.z; }
  return result;
}
function triangle(points, i0, i1, i2, color) {
  const x0=points[i0],y0=points[i0+1],z0=points[i0+2],x1=points[i1],y1=points[i1+1],z1=points[i1+2],x2=points[i2],y2=points[i2+1],z2=points[i2+2];
  const minX=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxX=Math.min(width-1,Math.ceil(Math.max(x0,x1,x2)));
  const minY=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxY=Math.min(height-1,Math.ceil(Math.max(y0,y1,y2)));
  const denom=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2); if(Math.abs(denom)<1e-7)return;
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
    const w0=((y1-y2)*(x+.5-x2)+(x2-x1)*(y+.5-y2))/denom;
    const w1=((y2-y0)*(x+.5-x2)+(x0-x2)*(y+.5-y2))/denom;
    const w2=1-w0-w1; if(w0<0||w1<0||w2<0)continue;
    const z=w0*z0+w1*z1+w2*z2,index=y*width+x;
    if(z<depth[index]) {depth[index]=z; pixels[index*3]=color[0];pixels[index*3+1]=color[1];pixels[index*3+2]=color[2];}
  }
}
async function data(file) { const bytes=gunzipSync(await fs.readFile(new URL(file,root))); return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength); }
let triangleCount=0;
for(const zone of renderZones) {
  const solid=decodePlantSurface(await data(zone.surface.file),zone), projected=project(solid.positions);
  assert.equal(solid.positions.length,zone.surface.vertices*3);
  for(let i=0;i<solid.positions.length;i++){const axis=i%3;assert(Number.isFinite(solid.positions[i]));assert(solid.positions[i]>=zone.bounds[axis]-.001&&solid.positions[i]<=zone.bounds[axis+3]+.001);}
  for(const index of solid.indices)assert(index<zone.surface.vertices);
  for(let i=0;i<solid.indices.length;i+=3) {
    const i0=solid.indices[i]*3,i1=solid.indices[i+1]*3,i2=solid.indices[i+2]*3;
    a.fromArray(solid.positions,i0);b.fromArray(solid.positions,i1);c.fromArray(solid.positions,i2);
    normal.crossVectors(b.sub(a),c.sub(a)).normalize();if(normal.dot(towardsCamera)<0)normal.negate();
    const ground=((solid.positions[i0+1]<.65?1:0)+(solid.positions[i1+1]<.65?1:0)+(solid.positions[i2+1]<.65?1:0))/3;
    const fresnel = Math.pow(1-Math.max(0,normal.dot(towardsCamera)),3)*.2;
    const shading=(.18+Math.max(0,normal.dot(light))*1.38+Math.max(0,normal.dot(fill))*.65+fresnel)*(1-ground*(1-plantArt.groundShade));
    triangle(projected,i0,i1,i2,base.map(channel=>Math.min(255,Math.max(0,channel*shading))));
  }
  triangleCount+=solid.indices.length/3;
}
let visibleLinePixels=0, hiddenLinePixels=0;
for(const zone of renderZones) {
  const lines=project(decodePlantZone(await data(zone.file),zone));
  const alpha=zone.id==='Infrastructure'?plantArt.infrastructureOpacity:plantArt.edgeOpacity;
  for(let i=0;i<lines.length;i+=6) {
    const dx=lines[i+3]-lines[i],dy=lines[i+4]-lines[i+1],steps=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy)));
    for(let step=0;step<=steps;step++) {
      const t=steps?step/steps:0,x=Math.round(lines[i]+dx*t),y=Math.round(lines[i+1]+dy*t);
      if(x<0||y<0||x>=width||y>=height)continue;
      const index=y*width+x,z=lines[i+2]+(lines[i+5]-lines[i+2])*t;
      if(z>depth[index]+.000025){hiddenLinePixels++;continue;}
      visibleLinePixels++;
      for(let channel=0;channel<3;channel++)pixels[index*3+channel]=pixels[index*3+channel]*(1-alpha)+edge[channel]*alpha;
    }
  }
}
const output=presentation!=='iso'?new URL(`../public/tengri/plant-${presentation}.webp`,import.meta.url):detail?new URL('../public/tengri/plant-detail.webp',import.meta.url):mode==='overview'?new URL('../public/tengri/plant-preview.webp',import.meta.url):`/tmp/tengri-plant-story-${mode}.png`;
const render=sharp(pixels,{raw:{width,height,channels:3}});
if(detail||mode==='overview'||presentation!=='iso') await render.webp({quality:90}).toFile(output.pathname); else await render.png().toFile(output);
console.log(JSON.stringify({output:String(output),triangleCount,visibleLinePixels,hiddenLinePixels,hiddenFraction:hiddenLinePixels/(hiddenLinePixels+visibleLinePixels)}));

// Camera framing and continuity are checked independently of the browser.
for(const [w,h] of [[1600,1000],[1280,720],[390,844],[320,650]]) {
  let previous;
  for(let step=0;step<=100;step++) {
    const pose=plantStoryPose(manifest,step/100,w,h,presentation);
    assert(pose.span>0&&Number.isFinite(pose.span));assert(pose.position.toArray().every(Number.isFinite));
    if(previous)assert(pose.position.distanceTo(previous.position)<100,'No camera discontinuities');
    previous=pose;
  }
}
console.log('Surface indices, source bounds and desktop/mobile scroll cameras passed.');
