import * as THREE from "three";
import type { PlantManifest, PlantZone } from "./plantData";

export type PlantPose = { position: THREE.Vector3; target: THREE.Vector3; span: number };
export type PlantPresentation = "iso" | "top" | "front";
export function boundsBox(bounds: PlantZone["bounds"]) { return new THREE.Box3(new THREE.Vector3(...bounds.slice(0, 3)), new THREE.Vector3(...bounds.slice(3))); }

export function fitPlantCamera(box: THREE.Box3, direction: THREE.Vector3, width: number, height: number, editorial = false): PlantPose {
  const target = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const position = direction.clone().normalize().multiplyScalar(Math.max(size.length() * 2.5, 200)).add(target);
  const camera = new THREE.OrthographicCamera(); camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld();
  const projected = new THREE.Box3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  const projectedSize = projected.getSize(new THREE.Vector3()), mobile = width < 981;
  const availableWidth = editorial && !mobile ? .94 : 1;
  const span = Math.max(projectedSize.y, projectedSize.x / (width / height * availableWidth)) * (editorial ? 1.06 : 1.12);
  if (editorial) {
    const offset = mobile
      ? new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(-span * .025)
      : new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(-span * .045);
    position.add(offset); target.add(offset);
  }
  return { position, target, span };
}

/** Start on the complete site, then orbit and move into the central process area. */
export function plantStoryPose(manifest: PlantManifest, progress: number, width: number, height: number, presentation: PlantPresentation = "iso"): PlantPose {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  if (presentation !== "iso") {
    // The source plant's long axis runs along Z, so an X-axis camera gives the
    // wide side elevation shown in the landing-page reference.
    const direction = presentation === "top" ? new THREE.Vector3(.001, 1, 0) : new THREE.Vector3(1, 0, 0);
    const pose = fitPlantCamera(boundsBox(manifest.bounds), direction, width, height);
    const push = THREE.MathUtils.smoothstep(p, .12, .95);
    pose.span *= THREE.MathUtils.lerp(1, .82, push);
    const camera = new THREE.OrthographicCamera(); camera.position.copy(pose.position); camera.lookAt(pose.target);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const offset = up.multiplyScalar(presentation === "front" ? pose.span * .09 : -pose.span * .025);
    pose.position.add(offset); pose.target.add(offset);
    return pose;
  }
  const t = THREE.MathUtils.smoothstep(p, .08, .92);
  const theta = THREE.MathUtils.lerp(.63, 1.5, t);
  const elevation = THREE.MathUtils.lerp(.42, .36, t);
  const direction = new THREE.Vector3(Math.sin(theta), elevation, Math.cos(theta));
  const pose = fitPlantCamera(boundsBox(manifest.bounds), direction, width, height, true);
  const push = THREE.MathUtils.smoothstep(p, .2, 1);
  pose.span *= THREE.MathUtils.lerp(1, width < 981 ? .68 : .58, push);
  const center = new THREE.Vector3(2, 14, -8);
  const shift = center.sub(pose.target).multiplyScalar(push * .6);
  pose.position.add(shift); pose.target.add(shift);
  return pose;
}
