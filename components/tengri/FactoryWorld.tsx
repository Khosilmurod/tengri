"use client";

import { useEffect, useRef, useState } from "react";
import type { Mesh, MeshStandardMaterial } from "three";
import styles from "./tengri.module.css";

type CameraView = "orbit" | "top";
type SceneControls = { view: (view: CameraView) => void; wireframe: (on: boolean) => void };

export function FactoryWorld({ interactive = false }: { interactive?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<SceneControls | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [view, setView] = useState<CameraView>("orbit");
  const [wireframe, setWireframe] = useState(false);
  const [selected, setSelected] = useState("Factory overview");

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let started = false;
    let visible = false;
    let release = () => {};

    async function initialize() {
      try {
        const [THREE, { OrbitControls }, { GLTFLoader }] = await Promise.all([
          import("three"),
          import("three/addons/controls/OrbitControls.js"),
          import("three/addons/loaders/GLTFLoader.js"),
        ]);
        if (disposed || !element) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute("aria-label", interactive ? "Interactive factory concept model" : "Factory concept model");
        if (!interactive) renderer.domElement.setAttribute("aria-hidden", "true");
        element.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(36, 1.8, .1, 500);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enabled = interactive;
        controls.enableDamping = true;
        controls.dampingFactor = .055;
        controls.enablePan = false;
        controls.enableZoom = interactive;
        controls.minDistance = 15;
        controls.maxDistance = 130;
        controls.minPolarAngle = .025;
        controls.maxPolarAngle = Math.PI / 2.08;
        controls.autoRotate = !interactive && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        controls.autoRotateSpeed = .16;

        scene.add(new THREE.HemisphereLight(0xe7f3ff, 0x16222a, 2.25));
        const key = new THREE.DirectionalLight(0xffffff, 3.1);
        key.position.set(-25, 45, 30);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x88b9d2, 1.6);
        fill.position.set(30, 18, -20);
        scene.add(fill);

        const materials = new Set<MeshStandardMaterial>();
        const meshes: Mesh[] = [];
        const originals = new Map<Mesh, MeshStandardMaterial>();
        const highlight = new THREE.MeshStandardMaterial({ color: 0xd2f0ff, emissive: 0x2c657e, emissiveIntensity: .4, roughness: .45, metalness: .25 });
        materials.add(highlight);
        let selectedMesh: Mesh | null = null;
        let center = new THREE.Vector3();
        let loaded = false;
        let currentView: CameraView = "orbit";

        function home(nextView: CameraView) {
          currentView = nextView;
          const factor = Math.max(1, 1.4 / camera.aspect);
          controls.target.copy(center);
          camera.position.copy(center).add(nextView === "top"
            ? new THREE.Vector3(0, 63 * factor, .1)
            : new THREE.Vector3(43, 31, 39).multiplyScalar(factor));
          controls.update();
        }
        const resize = () => {
          const width = element!.clientWidth, height = element!.clientHeight;
          if (!width || !height) return;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
          if (loaded) home(currentView);
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(element);
        resize();

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let pointerStart = { x: 0, y: 0 };
        const onDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; };
        const onClick = (event: MouseEvent) => {
          if (!interactive || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) return;
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(meshes, false)[0];
          if (!hit) return;
          if (selectedMesh) selectedMesh.material = originals.get(selectedMesh)!;
          selectedMesh = hit.object as Mesh;
          selectedMesh.material = highlight;
          setSelected(selectedMesh.name.replaceAll("_", " "));
        };
        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("click", onClick);
        renderer.setAnimationLoop(() => {
          if (!visible || document.hidden || !loaded) return;
          controls.update();
          renderer.render(scene, camera);
        });

        release = () => {
          api.current = null;
          renderer.setAnimationLoop(null);
          resizeObserver.disconnect();
          renderer.domElement.removeEventListener("pointerdown", onDown);
          renderer.domElement.removeEventListener("click", onClick);
          controls.dispose();
          scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
          materials.forEach(material => material.dispose());
          renderer.dispose();
          renderer.domElement.remove();
        };

        const gltf = await new GLTFLoader().loadAsync("/tengri/factory.glb");
        if (disposed) {
          gltf.scene.traverse(object => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
            }
          });
          return;
        }
        const model = gltf.scene;
        // The source mesh uses Z as its vertical axis. Three.js cameras use Y.
        model.rotation.x = -Math.PI / 2;
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          const name = object.name.toLowerCase();
          const decorative = /slab|floor|aisle|column|cell.state/.test(name);
          const color = name.includes("slab") ? 0x0c1115 : decorative ? 0x29383f : /robot|vision/.test(name) ? 0xa2d8ea : /belt|wheel|console/.test(name) ? 0x35444c : 0xa4b4bc;
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
          const material = new THREE.MeshStandardMaterial({ color, roughness: .62, metalness: .18 });
          object.material = material;
          materials.add(material);
          originals.set(object, material);
          if (!decorative) meshes.push(object);
        });
        scene.add(model);
        center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
        loaded = true;
        home("orbit");
        api.current = {
          view: home,
          wireframe(on) { materials.forEach(material => { material.wireframe = on; }); },
        };
        renderer.render(scene, camera);
        setStatus("ready");
      } catch {
        release();
        if (!disposed) setStatus("unavailable");
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !started) { started = true; void initialize(); }
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); release(); };
  }, [interactive]);

  function selectView(next: CameraView) { setView(next); api.current?.view(next); }
  function toggleWireframe() { const next = !wireframe; setWireframe(next); api.current?.wireframe(next); }

  return (
    <div className={`${styles.world} ${interactive ? styles.worldInteractive : styles.worldAmbient}`} data-ready={status === "ready"}>
      <img className={styles.worldPoster} src="/tengri/factory-preview.webp" alt={interactive ? "Illustrative factory with robot assembly, machining, conveyors, and logistics" : ""} />
      <div ref={host} className={styles.worldCanvas} />
      {interactive && <>
        <div className={styles.worldHeader}><span><i />Factory world / 001</span><span>Concept environment</span></div>
        <div className={styles.worldSelection} aria-live="polite"><span>Selected geometry</span><strong>{selected}</strong></div>
        <div className={styles.worldControls} role="group" aria-label="Factory view">
          <button type="button" disabled={status !== "ready"} aria-pressed={view === "orbit"} onClick={() => selectView("orbit")}>Orbit</button>
          <button type="button" disabled={status !== "ready"} aria-pressed={view === "top"} onClick={() => selectView("top")}>Top</button>
          <button type="button" disabled={status !== "ready"} aria-pressed={wireframe} onClick={toggleWireframe}>Wireframe</button>
        </div>
        <p className={styles.worldHint}>{status === "ready" ? "Drag to orbit · Scroll to zoom · Select a component" : status === "loading" ? "Preparing interactive world…" : "Factory overview · Interactive view unavailable"}</p>
      </>}
    </div>
  );
}
