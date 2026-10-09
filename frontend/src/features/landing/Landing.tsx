"use client";

import Image from "next/image";
import Link from "next/link";
import { LangSwitch } from "../../i18n/LangSwitch";
import { useLang } from "../../i18n/useLang";
import type { Key } from "../../i18n/dictionary";
import styles from "./Landing.module.css";

const STEPS = [1, 2, 3] as const;
const TRUST = [1, 2, 3, 4] as const;
const TOOLS = ["scrape_source", "classify_record", "index_records", "search_index", "draft_post"] as const;

export function Landing() {
  const { t } = useLang();
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#main">{t("nav.skip")}</a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={t("nav.home")}>
          <Image src="/kvart-na-kvadrat-logo.png" alt="" width={320} height={429} className={styles.logo} priority />
          <span className={styles.brandName}>kvart na kvadrat</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          <a href="#how">{t("nav.how")}</a>
          <a href="#trust">{t("nav.trust")}</a>
          <a href="#agents">{t("nav.agents")}</a>
        </nav>
        <div className={styles.headerEnd}>
          <LangSwitch />
          <Link href="/app" className={`${styles.btn} ${styles.btnPrimary} ${styles.headerCta}`}>{t("nav.start")}</Link>
        </div>
      </header>

      <main id="main">
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <h1>{t("hero.title")}</h1>
            <p className={styles.lede}>{t("hero.lede")}</p>
            <div className={styles.ctaRow}>
              <Link href="/app" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}>{t("hero.cta")}</Link>
              <a href="#how" className={`${styles.btn} ${styles.btnGhost} ${styles.btnLg}`}>{t("hero.secondary")}</a>
            </div>
            <p className={styles.heroNote}>{t("hero.note")}</p>
          </div>

          <figure className={styles.preview} aria-label={t("preview.label")}>
            <div className={styles.previewBlock}>
              <h2 className={styles.previewHead}>{t("preview.profile")}</h2>
              <ul className={styles.chips}>
                <li>{t("preview.chip1")}</li>
                <li>{t("preview.chip2")}</li>
                <li>{t("preview.chip3")}</li>
              </ul>
              <p className={styles.confirmed}><span className={styles.tick} aria-hidden="true" />{t("preview.confirm")}</p>
            </div>
            <div className={styles.previewBlock}>
              <h2 className={styles.previewHead}>{t("preview.results")}</h2>
              <p className={styles.postTitle}>{t("preview.post")}</p>
              <p className={styles.postMeta}>{t("preview.postMeta")}</p>
            </div>
            <figcaption className={styles.previewCaption}>{t("preview.synthetic")}</figcaption>
          </figure>
        </section>

        <section id="how" className={styles.section} aria-labelledby="how-title">
          <h2 id="how-title" className={styles.sectionTitle}>{t("how.title")}</h2>
          <ol className={styles.steps}>
            {STEPS.map((n) => (
              <li key={n} className={styles.step}>
                <span className={styles.stepNo} aria-hidden="true">{n}</span>
                <h3>{t(`how.${n}.title` as Key)}</h3>
                <p>{t(`how.${n}.body` as Key)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="trust" className={`${styles.section} ${styles.trust}`} aria-labelledby="trust-title">
          <div className={styles.trustIntro}>
            <h2 id="trust-title" className={styles.sectionTitle}>{t("trust.title")}</h2>
            <p className={styles.sectionLede}>{t("trust.lede")}</p>
          </div>
          <dl className={styles.trustList}>
            {TRUST.map((n) => (
              <div key={n} className={styles.trustRow}>
                <dt>{t(`trust.${n}.title` as Key)}</dt>
                <dd>{t(`trust.${n}.body` as Key)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="agents" className={styles.agents} aria-labelledby="agents-title">
          <div className={styles.agentsInner}>
            <div>
              <h2 id="agents-title" className={styles.agentsTitle}>{t("agents.title")}</h2>
              <p className={styles.agentsLede}>{t("agents.lede")}</p>
              <p className={styles.agentsNote}>{t("agents.note")}</p>
            </div>
            <ol className={styles.tools}>
              {TOOLS.map((tool) => (
                <li key={tool}>
                  <code>{tool}</code>
                  <span>{t(`agents.tool.${tool}` as Key)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={styles.final} aria-labelledby="cta-title">
          <h2 id="cta-title">{t("cta.title")}</h2>
          <Link href="/app" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}>{t("cta.button")}</Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>{t("footer.tagline")}</p>
        <p>{t("footer.data")}</p>
        <p>{t("footer.boundaries")}</p>
      </footer>
    </div>
  );
}
