import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import sharp from "sharp";

const bytes = await readFile(new URL("../public/tengri/factory.glb", import.meta.url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
const model = gltf.scene;
model.rotation.x = -Math.PI / 2;
model.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(model);
const center = bounds.getCenter(new THREE.Vector3());
const camera = new THREE.PerspectiveCamera(36, 1.8, .1, 250);
camera.position.copy(center).add(new THREE.Vector3(43, 31, 39));
camera.lookAt(center);
camera.updateMatrixWorld(true);
const light = new THREE.Vector3(-.5, 1, .5).normalize();
const faces = [];
const width = 1800, height = 1000;
model.traverse((object) => {
  if (!object.isMesh) return;
  const geometry = object.geometry;
  const positions = geometry.attributes.position;
  const index = geometry.index;
  const n = index ? index.count : positions.count;
  const name = object.name.toLowerCase();
  const base = new THREE.Color(name.includes("slab") ? "#10161a" : /floor|aisle|safety|column/.test(name) ? "#29383f" : /robot|vision/.test(name) ? "#a2d8ea" : /belt|wheel|console/.test(name) ? "#35444c" : "#a4b4bc");
  for (let i=0; i<n; i+=3) {
    const vertices = [0,1,2].map(k => new THREE.Vector3().fromBufferAttribute(positions,index ? index.getX(i+k) : i+k).applyMatrix4(object.matrixWorld));
    const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    const middle = vertices[0].clone().add(vertices[1]).add(vertices[2]).divideScalar(3);
    if (normal.dot(camera.position.clone().sub(middle)) <= 0) continue;
    const color = base.clone().multiplyScalar(.45 + .55 * Math.max(0,normal.dot(light)));
    const points = vertices.map(v => {
      const p=v.clone().project(camera);
      return `${((p.x+1)*width/2).toFixed(1)},${((1-p.y)*height/2).toFixed(1)}`;
    }).join(" ");
    const ground = /slab|floor|aisle|cell.state/.test(name) ? -10000 : 0;
    faces.push({depth: ground + middle.applyMatrix4(camera.matrixWorldInverse).z, svg:`<polygon points="${points}" fill="#${color.getHexString()}" stroke="#${color.getHexString()}" stroke-width="0.45"/>`});
  }
});
faces.sort((a,b) => a.depth-b.depth);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#000"/>${faces.map(f=>f.svg).join("")}</svg>`;
await sharp(Buffer.from(svg)).webp({quality:91}).toFile(new URL("../public/tengri/factory-preview.webp",import.meta.url).pathname);
console.log(`Rendered ${faces.length} visible faces from the existing factory geometry.`);
