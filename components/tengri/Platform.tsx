import { tengri } from "@/content/tengri";
import styles from "./site.module.css";

export function Platform() {
  return (
    <section id="platform" className={styles.process}>
      <img className={styles.processImage} src="/tengri/world-model.webp" alt="" aria-hidden="true" loading="lazy" width="1920" height="1024" />
      <div className={styles.processShade} aria-hidden="true" />
      <div className={`container ${styles.processContent}`}>
        <h2 className="h2 reveal">Robotics for<br /><em>the factory floor.</em></h2>
        <div className={styles.processList}>
          {tengri.stages.map(stage => <article className={`reveal ${styles.processStep}`} key={stage.id}>
            <h3 className={styles.processTitle}>{stage.title}</h3>
            <p>{stage.description}</p>
          </article>)}
        </div>
      </div>
    </section>
  );
}
