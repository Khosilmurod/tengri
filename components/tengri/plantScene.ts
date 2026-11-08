import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { decodePlantZone, decodePlantSurface, type PlantManifest, type PlantZone } from "./plantData";
import { fitPlantCamera, plantStoryPose, type PlantPose, type PlantPresentation } from "./plantCamera";
import { plantArt } from "./plantArt";

export type PlantView = "iso" | "top" | "front" | "free";
export type PlantScene = ReturnType<typeof createPlantScene>;
type Callbacks = {
  signal: AbortSignal;
  onManifest: (manifest: PlantManifest) => void;
  onProgress: (loaded: number) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onSelect: (id: string) => void;
  onView: (view: PlantView) => void;
  onManualChange: (manual: boolean) => void;
};

export function createPlantScene(element: HTMLElement, callbacks: Callbacks, presentation: PlantPresentation = "iso") {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = plantArt.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute("aria-hidden", "true");
  element.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .04, .1, 100, { size: 128 });
  scene.environment = environment.texture; scene.environmentIntensity = plantArt.environmentIntensity;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x111216, plantArt.ambientIntensity));
  const key = new THREE.DirectionalLight(0xffffff, plantArt.keyIntensity); key.position.set(...plantArt.keyPosition); scene.add(key);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -145, right: 145, top: 145, bottom: -145, near: .1, far: 400 });
  key.shadow.camera.updateProjectionMatrix(); key.shadow.bias = -.0001; key.shadow.normalBias = .08;
  const rim = new THREE.DirectionalLight(0xe7efff, plantArt.rimIntensity); rim.position.set(...plantArt.rimPosition); scene.add(rim);
  const camera = new THREE.OrthographicCamera(-150, 150, 100, -100, 0.1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.rotateSpeed = 0.65;
  controls.panSpeed = 0.8;
  controls.zoomSpeed = 0.8;
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = Math.PI / 2;
  controls.minZoom = 0.45;
  controls.maxZoom = 20;
  controls.screenSpacePanning = true;
  renderer.domElement.style.touchAction = "pan-y";
  const zones = new Map<string, THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>>();
  const surfaces = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>();
  let manifest: PlantManifest | null = null;
  let interactive = false;
  let fullscreen = false;
  let scrollProgress = 0;
  let storyPose: PlantPose | null = null;
  const box = new THREE.Box3();
  const dimensionGroup = new THREE.Group();
  dimensionGroup.visible = false;
  scene.add(dimensionGroup);
  const textures: THREE.Texture[] = [];
  let grid: THREE.GridHelper | null = null;
  let selectionBox: THREE.Box3Helper | null = null;
  let selected = "";
  let isolated = false;
  let disposed = false;
  let contextHealthy = true;
  let visible = true;
  let frame = 0;
  let span = 220;
  let width = 1, height = 1;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let transition: { start: number; fromPosition: THREE.Vector3; toPosition: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; fromSpan: number; toSpan: number; fromZoom: number } | null = null;

  function schedule() {
    if (!frame && visible && !disposed && contextHealthy && !document.hidden) frame = requestAnimationFrame(render);
  }
  function updateProjection() {
    const half = span / 2;
    camera.left = -half * width / height; camera.right = half * width / height;
    camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
  }
  function render(now: number) {
    frame = 0;
    if (disposed || !visible) return;
    if (!interactive && storyPose) {
      const alpha = reducedMotion ? 1 : .14;
      camera.position.lerp(storyPose.position, alpha); controls.target.lerp(storyPose.target, alpha);
      span = THREE.MathUtils.lerp(span, storyPose.span, alpha); camera.zoom = THREE.MathUtils.lerp(camera.zoom, 1, alpha);
      updateProjection();
      if (camera.position.distanceToSquared(storyPose.position) > .0001 || Math.abs(span - storyPose.span) > .001 || Math.abs(camera.zoom - 1) > .001) schedule();
    }
    if (transition) {
      const progress = reducedMotion ? 1 : Math.min(1, (now - transition.start) / 650);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
      controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
      span = THREE.MathUtils.lerp(transition.fromSpan, transition.toSpan, eased);
      camera.zoom = THREE.MathUtils.lerp(transition.fromZoom, 1, eased);
      updateProjection();
      if (progress === 1) { transition = null; controls.enableDamping = true; }
      else schedule();
    }
    controls.update();
    renderer.render(scene, camera);
  }
  function updateStory(immediate = false) {
    if (!manifest) return;
    storyPose = plantStoryPose(manifest, reducedMotion ? 0 : scrollProgress, width, height, presentation);
    if (immediate) { camera.position.copy(storyPose.position); controls.target.copy(storyPose.target); span = storyPose.span; camera.zoom = 1; updateProjection(); controls.update(); }
    schedule();
  }
  function resize() {
    width = Math.max(1, element.clientWidth); height = Math.max(1, element.clientHeight);
    renderer.setSize(width, height);
    updateProjection(); if (!interactive) updateStory(true); schedule();
  }
  function fit(targetBox: THREE.Box3, view: Exclude<PlantView, "free"> | null = null, animate = true) {
    if (targetBox.isEmpty()) return;
    transition = null;
    controls.enableDamping = false;
    controls.update();
    const direction = view === "top" ? new THREE.Vector3(0.001, 1, 0) : view === "front" ? new THREE.Vector3(1, 0, 0) : view === "iso" ? new THREE.Vector3(...plantArt.homeDirection) : camera.position.clone().sub(controls.target).normalize();
    const { position, target: center, span: nextSpan } = manifest && targetBox === box && view === presentation
      ? plantStoryPose(manifest, 0, width, height, presentation)
      : fitPlantCamera(targetBox, direction, width, height);
    if (animate && !reducedMotion) {
      transition = { start: performance.now(), fromPosition: camera.position.clone(), toPosition: position, fromTarget: controls.target.clone(), toTarget: center, fromSpan: span, toSpan: nextSpan, fromZoom: camera.zoom };
    } else {
      camera.position.copy(position); controls.target.copy(center); camera.zoom = 1; span = nextSpan;
      controls.update(); controls.enableDamping = true; updateProjection();
    }
    if (view) callbacks.onView(view);
    schedule();
  }
  function selectedBounds() { return selected && zones.get(selected)?.geometry.boundingBox || box; }
  function styleZones() {
    zones.forEach((lines, id) => {
      lines.visible = !isolated || selected === id;
      lines.material.color.set(selected === id ? 0xffffff : plantArt.edge);
      lines.material.opacity = selected ? selected === id ? .32 : .025 : id === "Infrastructure" ? plantArt.infrastructureOpacity : plantArt.edgeOpacity;
      const surface = surfaces.get(id);
      if (surface) { surface.visible = lines.visible; surface.material.color.set(selected ? selected === id ? 0xa5adb5 : 0x42464b : plantArt.surface); }
    });
    if (selectionBox) {
      selectionBox.visible = Boolean(selected) && !isolated;
      if (selected) selectionBox.box.copy(selectedBounds());
    }
    dimensionGroup.visible = Boolean(dimensionGroup.userData.enabled) && !isolated;
    renderer.shadowMap.needsUpdate = true;
    schedule();
  }
  function select(id: string) {
    if (id && !zones.has(id)) return;
    takeControl();
    const wasIsolated = isolated;
    selected = id; isolated = false; styleZones(); callbacks.onSelect(id);
    if (!id || wasIsolated) fit(selectedBounds());
  }
  function zoom(factor: number) {
    takeControl();
    transition = null; controls.enableDamping = true;
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
    camera.updateProjectionMatrix(); schedule();
  }
  function label(text: string, position: THREE.Vector3) {
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.font = "24px monospace"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillStyle = "#000000"; context.fillRect(0, 0, 256, 64);
    context.fillStyle = "#aaaaaa"; context.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.copy(position); sprite.scale.set(19, 4.75, 1); dimensionGroup.add(sprite);
  }
  function addDimensions() {
    const { min, max } = box, y = min.y - 0.1, z = max.z + 12, x = min.x - 12;
    const points = [min.x,y,z, max.x,y,z, min.x,y,max.z+2, min.x,y,z+3, max.x,y,max.z+2, max.x,y,z+3,
      x,y,min.z, x,y,max.z, min.x-2,y,min.z, x-3,y,min.z, min.x-2,y,max.z, x-3,y,max.z];
    for (const xx of [min.x, max.x]) points.push(xx-2,y,z-2, xx+2,y,z+2);
    for (const zz of [min.z, max.z]) points.push(x-2,y,zz-2, x+2,y,zz+2);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    dimensionGroup.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.55, depthTest: false })));
    label(`${(max.x-min.x).toFixed(1)} m`, new THREE.Vector3((min.x+max.x)/2, y, z+4));
    label(`${(max.z-min.z).toFixed(1)} m`, new THREE.Vector3(x-4, y, (min.z+max.z)/2));
  }

  let down: { x: number; y: number; id: number } | null = null;
  let multiTouch = false;
  const activePointers = new Set<number>();
  function pointerDown(event: PointerEvent) {
    activePointers.add(event.pointerId);
    if (activePointers.size > 1) { multiTouch = true; takeControl(); }
    else { multiTouch = false; down = { x: event.clientX, y: event.clientY, id: event.pointerId }; }
    if (event.pointerType !== "touch") element.focus({ preventScroll: true });
  }
  function pointerMove(event: PointerEvent) {
    if (interactive || !down) return;
    const dx = Math.abs(event.clientX - down.x), dy = Math.abs(event.clientY - down.y);
    if (activePointers.size > 1 || Math.hypot(dx, dy) > 6) takeControl();
  }
  function pointerUp(event: PointerEvent) {
    activePointers.delete(event.pointerId);
    if (!down || down.id !== event.pointerId || multiTouch || event.button !== 0 || Math.hypot(event.clientX-down.x, event.clientY-down.y) > 5) { down = null; return; }
    down = null;
    const rect = element.getBoundingClientRect();
    const point = new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1, -(event.clientY-rect.top)/rect.height*2+1);
    const raycaster = new THREE.Raycaster(); raycaster.params.Line = { threshold: Math.max(0.08, span / camera.zoom / height * 3) };
    raycaster.setFromCamera(point, camera);
    const hit = raycaster.intersectObjects([...surfaces.values()].filter(mesh => mesh.visible), false)[0];
    if (hit) select(String(hit.object.userData.zoneId));
  }
  function pointerCancel(event: PointerEvent) { activePointers.delete(event.pointerId); down = null; }
  function takeControl() {
    transition = null; controls.enableDamping = true;
    if (!interactive) { interactive = true; callbacks.onManualChange(true); }
    callbacks.onView("free"); schedule();
  }
  // Wheel scrolling belongs to the page. Trackpad pinch and fullscreen can zoom the model.
  function wheel(event: WheelEvent) {
    if (!fullscreen && !event.ctrlKey) event.stopImmediatePropagation();
    else takeControl();
  }
  function visibility() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); }
  function contextLost(event: Event) { event.preventDefault(); contextHealthy = false; cancelAnimationFrame(frame); frame = 0; callbacks.onError("The graphics connection was interrupted. Reload the plant to continue."); }
  controls.addEventListener("change", schedule);
  renderer.domElement.addEventListener("pointerdown", pointerDown, true);
  renderer.domElement.addEventListener("pointermove", pointerMove, true);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointercancel", pointerCancel);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  renderer.domElement.addEventListener("wheel", wheel, { capture: true, passive: true });
  document.addEventListener("visibilitychange", visibility);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element);
  const visibilityObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) schedule(); else { cancelAnimationFrame(frame); frame = 0; }
  });
  visibilityObserver.observe(element); resize();

  async function load() {
    try {
      const response = await fetch("/tengri/plant/manifest.json", { signal: callbacks.signal });
      if (!response.ok) throw new Error("The model index is unavailable.");
      manifest = await response.json() as PlantManifest;
      if (disposed) return;
      callbacks.onManifest(manifest);
      box.set(new THREE.Vector3(...manifest.bounds.slice(0,3)), new THREE.Vector3(...manifest.bounds.slice(3,6)));
      grid = new THREE.GridHelper(280, 28, 0x292929, 0x191919);
      grid.visible = false;
      grid.position.y = box.min.y - 0.3;
      const gridMaterial = grid.material as THREE.LineBasicMaterial;
      gridMaterial.transparent = true; gridMaterial.opacity = 0.35; gridMaterial.depthWrite = false;
      scene.add(grid);
      selectionBox = new THREE.Box3Helper(box.clone(), new THREE.Color(0x777777));
      const selectionMaterial = selectionBox.material as THREE.LineBasicMaterial;
      selectionMaterial.transparent = true; selectionMaterial.opacity = 0.45;
      selectionBox.visible = false; scene.add(selectionBox);
      addDimensions(); controls.enableDamping = false; callbacks.onView(presentation); updateStory(true);
      const queue = [...manifest.zones].sort((a, b) => a.id === "Infrastructure" ? -1 : b.id === "Infrastructure" ? 1 : a.bytes - b.bytes);
      let loaded = 0;
      async function worker() {
        while (queue.length && !disposed) {
          const zone = queue.shift() as PlantZone;
          async function fetchGeometry(file: string) {
            const data = await fetch(`/tengri/plant/${file}`, { signal: callbacks.signal });
            if (!data.ok || !data.body) throw new Error(`The ${zone.label} section is unavailable.`);
            return new Response(data.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
          }
          const [bytes, solidBytes] = await Promise.all([fetchGeometry(zone.file), fetchGeometry(zone.surface.file)]);
          if (disposed) return;
          const geometry = new THREE.BufferGeometry();
          const positions = decodePlantZone(bytes, zone);
          geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          geometry.computeBoundingBox(); geometry.computeBoundingSphere();
          const material = new THREE.LineBasicMaterial({ color: plantArt.edge, transparent: true, opacity: zone.id === "Infrastructure" ? plantArt.infrastructureOpacity : plantArt.edgeOpacity, depthWrite: false });
          const lines = new THREE.LineSegments(geometry, material); lines.userData.zoneId = zone.id;
          const solid = decodePlantSurface(solidBytes, zone);
          const solidGeometry = new THREE.BufferGeometry();
          solidGeometry.setAttribute("position", new THREE.BufferAttribute(solid.positions, 3));
          solidGeometry.setIndex(new THREE.BufferAttribute(solid.indices, 1));
          solidGeometry.computeVertexNormals(); solidGeometry.computeBoundingSphere();
          const colors = new Float32Array(solid.positions.length);
          for (let i = 0; i < colors.length; i += 3) { const shade = solid.positions[i + 1] < .65 ? plantArt.groundShade : 1; colors[i] = shade; colors[i + 1] = shade; colors[i + 2] = shade; }
          solidGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          const mesh = new THREE.Mesh(solidGeometry, new THREE.MeshStandardMaterial({ color: plantArt.surface, roughness: plantArt.roughness, metalness: plantArt.metalness, flatShading: true, vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
          mesh.castShadow = true; mesh.receiveShadow = true;
          mesh.userData.zoneId = zone.id;
          zones.set(zone.id, lines); surfaces.set(zone.id, mesh); scene.add(mesh, lines); renderer.shadowMap.needsUpdate = true; callbacks.onProgress(++loaded); schedule();
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      if (!disposed && contextHealthy) callbacks.onReady();
    } catch (error) {
      if (!disposed && !callbacks.signal.aborted) callbacks.onError(error instanceof Error ? error.message : "Please check your connection and try again.");
    }
  }
  void load();

  function resumeScroll() {
    interactive = false; transition = null; controls.enableDamping = false; callbacks.onManualChange(false);
    callbacks.onView(presentation);
    selected = ""; isolated = false; callbacks.onSelect(""); styleZones();
    if (grid) grid.visible = false; dimensionGroup.visible = false; dimensionGroup.userData.enabled = false; controls.update(); updateStory();
  }

  return {
    select,
    zoom,
    setScrollProgress(progress: number) {
      const moved = Math.abs(progress - scrollProgress) > .0001;
      scrollProgress = progress;
      if (moved && interactive && !fullscreen && !activePointers.size) resumeScroll();
      else if (!interactive) updateStory();
    },
    resumeScroll,
    setFullscreen(enabled: boolean) { fullscreen = enabled; renderer.domElement.style.touchAction = enabled ? "none" : "pan-y"; if (enabled) takeControl(); },
    setView(view: Exclude<PlantView, "free">) { takeControl(); fit(isolated ? selectedBounds() : box, view); },
    setGrid(show: boolean) { if (grid) grid.visible = show; schedule(); },
    setDimensions(show: boolean) { takeControl(); dimensionGroup.userData.enabled = show; dimensionGroup.visible = show && !isolated; if (show && !isolated) fit(box.clone().expandByScalar(16)); schedule(); },
    focus() { takeControl(); if (selected) fit(selectedBounds()); },
    isolate(show: boolean) { takeControl(); if (!selected) return; isolated = show; styleZones(); fit(show ? selectedBounds() : box); },
    reset() { takeControl(); selected = ""; isolated = false; callbacks.onSelect(""); styleZones(); fit(box, presentation); },
    navigate(key: string) {
      takeControl();
      if (key === "+" || key === "=") { zoom(1.2); return; }
      if (key === "-") { zoom(1 / 1.2); return; }
      transition = null; controls.enableDamping = false; controls.update();
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (key === "ArrowLeft") spherical.theta -= 0.12;
      if (key === "ArrowRight") spherical.theta += 0.12;
      if (key === "ArrowUp") spherical.phi -= 0.1;
      if (key === "ArrowDown") spherical.phi += 0.1;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      controls.update(); controls.enableDamping = true; callbacks.onView("free"); schedule();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); controls.dispose(); resizeObserver.disconnect(); visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("pointerdown", pointerDown, true);
      renderer.domElement.removeEventListener("pointermove", pointerMove, true);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", pointerCancel);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener("wheel", wheel, true);
      scene.traverse(object => {
        const drawable = object as THREE.Mesh;
        drawable.geometry?.dispose();
        if (Array.isArray(drawable.material)) drawable.material.forEach(material => material.dispose());
        else drawable.material?.dispose();
      });
      textures.forEach(texture => texture.dispose()); environment.dispose(); key.shadow.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
