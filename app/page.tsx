import { TengriMotion } from "@/components/TengriMotion";
import { FactoryBlueprint } from "@/components/tengri/FactoryBlueprint";
import { Platform } from "@/components/tengri/Platform";
import { tengri } from "@/content/tengri";
import styles from "@/components/tengri/site.module.css";

export default function TengriPage() {
  return <div className={styles.site}>
    <header className={`nav ${styles.nav}`} id="nav">
      <div className="nav__frost" aria-hidden="true">{[1, 2, 3, 4].map(band => <span key={band} className={`nav__frost-band nav__frost-band--${band}`} />)}</div>
      <div className="nav__inner">
        <a className={`nav__brand ${styles.brand}`} href="#top" aria-label="Tengri home"><span className="nav__logo" aria-hidden="true"><span className="nav__logo-chip" /><span className={`nav__logo-t ${styles.brandInitial}`}>T</span><span className="nav__logo-rest-track"><span className={`nav__logo-rest ${styles.brandName}`}>ENGRI</span></span></span></a>
        <div className="nav__actions"><a className="nav__link" href="#world-models">Explore</a><a className="nav__link" href="#platform">Platform</a><a className="nav__link nav__link--cta" href="#join">Contact</a></div>
      </div>
    </header>
    <main>
      <section className={`hero hero--video ${styles.hero}`} id="hero">
        <div className="hero__media" aria-hidden="true"><img className="hero__video" src="/tengri/robotics-hero.webp" alt="" fetchPriority="high" /></div>
        <div className="hero__fade" aria-hidden="true" />
        <div className="container hero__content">
          <h1 className="hero__title"><span className="hero__line hero__title--name">Tengri</span></h1>
          <p className="hero__copy hero__seq">World models for factories.</p>
          <div className="hero__actions hero__seq"><a className="link-cta link-cta--fill" href="#world-models">Explore</a><a className="link-cta" href="#join">Contact</a></div>
        </div>
        <a className={styles.scrollCue} href="#statement" aria-label="Scroll to discover Tengri"><span aria-hidden="true">↓</span></a>
      </section>
      <section className="statement-sec" id="statement">
        <div className="container"><p className="statement reveal">We’re building world models for robots to learn, test, and work in real factories.</p></div>
      </section>
      <FactoryBlueprint presentation="front" />
      <FactoryBlueprint id="plant-top" presentation="top" />
      <Platform />
    </main>
    <footer className="footer" id="join">
      <canvas className="footer__grid-fx" aria-hidden="true" /><div className="footer__fade" aria-hidden="true" />
      <div className="container">
        <div className="footer__cta"><h2 className="footer__head reveal">Build with<br />Tengri.</h2><div className="footer__actions reveal"><a className="link-cta link-cta--fill" href={`mailto:${tengri.contactEmail}`}>Get in touch</a></div></div>
        <div className="footer__meta" aria-hidden="true" />
        <div className="footer__base"><a className={styles.contactEmail} href={`mailto:${tengri.contactEmail}`}>{tengri.contactEmail}</a></div>
      </div>
    </footer>
    <TengriMotion />
  </div>;
}
