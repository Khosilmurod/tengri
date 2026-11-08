"use client";

import { useEffect, useRef, useState } from "react";
import type { PlantManifest } from "./plantData";
import type { PlantScene, PlantView } from "./plantScene";
import type { PlantPresentation } from "./plantCamera";
import styles from "./FactoryBlueprint.module.css";

export function FactoryBlueprint({ id = "world-models", presentation = "iso" }: { id?: string; presentation?: PlantPresentation }) {
  const viewLabel = presentation === "top" ? "Top view" : presentation === "front" ? "Front view" : "World models";
  const helpId = `${id}-help`;
  const shell = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null);
  const scene = useRef<PlantScene | null>(null), progress = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [manifest, setManifest] = useState<PlantManifest | null>(null);
  const [loaded, setLoaded] = useState(0), [ready, setReady] = useState(false), [error, setError] = useState("");
  const [manual, setManual] = useState(false), [view, setView] = useState<PlantView>(presentation);
  const [selected, setSelected] = useState(""), [isolated, setIsolated] = useState(false);
  const [grid, setGrid] = useState(false), [dimensions, setDimensions] = useState(false), [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const abort = new AbortController();
    let started = false, current: PlantScene | null = null;
    setLoaded(0); setReady(false); setError(""); setManual(false); setSelected(""); setIsolated(false); setGrid(false); setDimensions(false);
    const observer = new IntersectionObserver(async entries => {
      if (!entries.some(entry => entry.isIntersecting) || started) return;
      started = true; observer.disconnect();
      try {
        const { createPlantScene } = await import("./plantScene");
        if (abort.signal.aborted) return;
        current = createPlantScene(element, {
          signal: abort.signal, onManifest: setManifest, onProgress: setLoaded,
          onReady: () => { setReady(true); current?.setScrollProgress(progress.current); },
          onError: message => { setError(message); setReady(false); },
          onSelect: id => { setSelected(id); setIsolated(false); }, onView: setView,
          onManualChange: value => { setManual(value); if (!value) { setGrid(false); setDimensions(false); } },
        }, presentation);
        scene.current = current; current.setScrollProgress(progress.current);
      } catch { if (!abort.signal.aborted) setError("Enable graphics acceleration to explore the plant."); }
    }, { rootMargin: "500px" });
    observer.observe(element);
    return () => { observer.disconnect(); abort.abort(); current?.dispose(); scene.current = null; };
  }, [attempt, presentation]);

  useEffect(() => {
    const element = shell.current;
    if (!element) return;
    let frame = 0, previous = -1;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    function update() {
      frame = 0;
      const rect = element!.getBoundingClientRect(), travel = Math.max(1, rect.height - (stage.current?.clientHeight ?? window.innerHeight));
      const next = reduced.matches ? 0 : Math.max(0, Math.min(1, -rect.top / travel));
      if (next === previous) return;
      previous = next; progress.current = next; scene.current?.setScrollProgress(next);
    }
    function queue() { if (!frame) frame = requestAnimationFrame(update); }
    const resize = new ResizeObserver(queue); resize.observe(element);
    window.addEventListener("scroll", queue, { passive: true }); window.addEventListener("resize", queue); reduced.addEventListener("change", queue); queue();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); window.removeEventListener("scroll", queue); window.removeEventListener("resize", queue); reduced.removeEventListener("change", queue); };
  }, []);

  useEffect(() => {
    const update = () => { const expanded = document.fullscreenElement === stage.current; setFullscreen(expanded); scene.current?.setFullscreen(expanded); };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  function resume() { scene.current?.resumeScroll(); setGrid(false); setDimensions(false); }
  async function expand() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen(); } catch { /* The inline model stays fully interactive. */ }
  }

  return <section id={id} className={styles.section} aria-label={`Factory model — ${viewLabel}`} data-presentation={presentation}>
    <div ref={shell} className={styles.shell}>
      <div ref={stage} id={`${id}-viewer`} className={styles.stage} data-ready={ready} data-manual={manual} data-fullscreen={fullscreen}>
        <img className={styles.poster} src={presentation === "iso" ? "/tengri/plant-preview.webp" : `/tengri/plant-${presentation}.webp`} alt="" aria-hidden="true" loading="lazy" />
        <div ref={surface} className={styles.canvas} tabIndex={ready ? 0 : -1} role="region" aria-label={`Interactive 3D plant, ${viewLabel.toLowerCase()}. Drag to rotate.`} aria-describedby={helpId} onKeyDown={event => {
          if (!ready) return;
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0", "Home", "Escape"].includes(event.key)) {
            event.preventDefault();
            if (event.key === "Escape") { if (fullscreen) void document.exitFullscreen(); else resume(); }
            else if (event.key === "0" || event.key === "Home") scene.current?.reset();
            else scene.current?.navigate(event.key);
          }
        }} />
        <div className={styles.edgeFade} aria-hidden="true" />
        <header className={`container ${styles.heading}`}>
          <div><p className="kicker">{viewLabel}</p><h2 className="h2 reveal">A complete<br />industrial plant.</h2></div>
        </header>
        {error ? <div className={styles.loadState} role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Reload model ↗</button></div>
          : !ready && <p className={styles.loadState} role="status">Loading geometry <span>{loaded} / 16</span></p>}
        <div className={`container ${styles.controls}`}>
          <div className={styles.selection}>
            <select aria-label="Select plant section" disabled={!ready} value={selected} onChange={event => scene.current?.select(event.target.value)}><option value="">Entire plant</option>{manifest?.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.id === "CentralCentral" ? "Central" : zone.label}</option>)}</select>
            {selected && <><button type="button" onClick={() => scene.current?.focus()}>Focus ↗</button><button type="button" aria-pressed={isolated} onClick={() => { scene.current?.isolate(!isolated); setIsolated(!isolated); }}>{isolated ? "Show all" : "Isolate"}</button></>}
            <p id={helpId}><span className={styles.desktopHint}>{manual ? "Drag to rotate · Scroll to continue" : "Scroll to explore · Drag to rotate"}</span><span className={styles.mobileHint}>Swipe sideways to rotate · Pinch to zoom</span></p>
          </div>
          <div className={styles.actions}>
            {manual && !fullscreen && <button type="button" className={styles.resume} onClick={resume}>Follow scroll <span aria-hidden="true">↓</span></button>}
            <div className={styles.zoom} role="group" aria-label="Zoom"><button type="button" disabled={!ready} aria-label="Zoom out plant" onClick={() => scene.current?.zoom(1 / 1.25)}>−</button><button type="button" disabled={!ready} aria-label="Zoom in plant" onClick={() => scene.current?.zoom(1.25)}>+</button></div>
            <details className={styles.options} onKeyDown={event => { if (event.key === "Escape") event.currentTarget.open = false; }}>
              <summary>View <span aria-hidden="true">⌃</span></summary>
              <div className={styles.menu}>
                {([['iso', '3D'], ['top', 'Top'], ['front', 'Front']] as const).map(([id, label]) => <button key={id} type="button" disabled={!ready} aria-pressed={view === id} onClick={() => scene.current?.setView(id)}>{label}</button>)}
                <span className={styles.menuRule} />
                <button type="button" disabled={!ready} aria-pressed={grid} onClick={() => { setGrid(!grid); scene.current?.setGrid(!grid); }}>Grid</button>
                <button type="button" disabled={!ready} aria-pressed={dimensions} onClick={() => { setDimensions(!dimensions); scene.current?.setDimensions(!dimensions); }}>Dimensions</button>
              </div>
            </details>
            <button type="button" disabled={!ready} onClick={() => scene.current?.reset()}>Reset</button>
            <button className={styles.expand} type="button" disabled={!ready} onClick={expand}>{fullscreen ? "Exit" : "Expand"} <span aria-hidden="true">↗</span></button>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
