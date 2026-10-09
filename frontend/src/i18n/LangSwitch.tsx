"use client";

import { LANGS } from "./dictionary";
import { useLang } from "./useLang";
import styles from "./LangSwitch.module.css";

export function LangSwitch() {
  const { lang, setLang, t } = useLang();
  return (
    <div className={styles.switch} role="group" aria-label={t("lang.label")}>
      {LANGS.map((code) => (
        <button key={code} type="button" lang={code} className={styles.opt} aria-pressed={lang === code} onClick={() => setLang(code)}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
