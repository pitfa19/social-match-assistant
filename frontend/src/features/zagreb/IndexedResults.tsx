"use client";

import { useEffect, useRef, useState } from "react";
import { findNeighbourhood } from "./neighbourhoods";
import { searchFacts, type MatchResponse } from "./indexedSearch";
import type { Note } from "./profileLogic";
import { useLang } from "../../i18n/useLang";
import styles from "./Zagreb.module.css";

type Outcome = { key: string; data?: MatchResponse; error?: string };

/** The profile and selected map area are the only search controls. No collection happens here. */
export function IndexedResults({ areaId, notes }: { areaId: string; notes: Note[] }) {
  const { t } = useLang();
  const [retry, setRetry] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>({ key: "" });
  const cache = useRef(new Map<string, { until: number; data: MatchResponse }>());
  const body = JSON.stringify({ areaId, cityWide: false, facts: searchFacts(notes) });
  const key = `${retry}:${body}`;
  const current = outcome.key === key ? outcome : null;
  const data = current?.data;
  const area = findNeighbourhood(areaId);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      const saved = cache.current.get(body);
      if (saved && saved.until > Date.now()) { setOutcome({ key, data: saved.data }); return; }
      try {
        const r = await fetch("/api/zagreb/matches", { method: "POST", headers: { "content-type": "application/json" }, body, signal: ac.signal });
        const value = await r.json();
        if (!r.ok) throw new Error(value.error || t("res.unavailable"));
        if (!Array.isArray(value.results) || typeof value.indexAvailable !== "boolean") throw new Error(t("res.invalid"));
        if (ac.signal.aborted) return;
        if (value.indexAvailable) {
          if (cache.current.size >= 8) cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(body, { until: Date.now() + 30_000, data: value });
        }
        setOutcome({ key, data: value });
      } catch (e) {
        if (!ac.signal.aborted) setOutcome({ key, error: e instanceof Error ? e.message : t("res.failed") });
      }
    }, 250);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [body, key, t]);

  const refresh = () => { cache.current.delete(body); setRetry((v) => v + 1); };
  return <section className={styles.matches} aria-labelledby="matches-title" data-testid="indexed-results" data-area={areaId} aria-busy={!current}>
    <span className={styles.eyebrow}>{area?.name ?? t("res.areaFallback")}</span>
    <h2 id="matches-title">{t("res.title")}</h2>
    <p className={styles.matchesHint}>{t("res.hint")}</p>
    {!current && <div className={styles.searchLoading} role="status"><span className={styles.spinner} aria-hidden="true" /> {t("res.loading")}</div>}
    {current?.error && <div role="status"><p>{current.error}</p><button className={styles.searchRetry} onClick={refresh}>{t("res.retry")}</button></div>}
    {data && <div className={styles.searchReveal}>
      {!data.indexAvailable && <p role="status">{t("res.unavailable")} <button onClick={refresh}>{t("res.retry")}</button></p>}
      {data.indexAvailable && !data.searched && <p role="status">{t("res.needProfile")}</p>}
      {data.indexAvailable && data.searched && !data.results.length && <p role="status" data-testid="index-empty">{t("res.empty")}</p>}
      {!!data.results.length && <>
        <ul className={styles.matchList}>{data.results.map((r) => <li key={r.id} data-testid="matched-post" data-source={r.source}>
          <span className={styles.matchMeta}>{r.source === "demo" ? t("res.src.demo") : r.source === "facebook" ? t("res.src.facebook") : r.source === "reddit" ? t("res.src.reddit") : t("res.src.other")} · {r.areaBasis === "explicit_text" ? t("res.mentions", { name: area?.name ?? "" }) : area?.name}</span>
          <h3>{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a> : r.title}</h3>
          <p>{r.body}</p>
        </li>)}</ul>
        <p className={styles.matchesHint}>{t("res.footnote")}</p>
      </>}
      {data.truncated && <p className={styles.matchesHint}>{t("res.truncated")}</p>}
    </div>}
  </section>;
}
