"use client";

import { useEffect, useRef, useState } from "react";
import { findNeighbourhood } from "./neighbourhoods";
import { searchFacts, type MatchResponse } from "./indexedSearch";
import type { Note } from "./profileLogic";
import styles from "./Zagreb.module.css";

type Outcome = { key: string; data?: MatchResponse; error?: string };

/** The profile and selected map area are the only search controls. No collection happens here. */
export function IndexedResults({ areaId, notes }: { areaId: string; notes: Note[] }) {
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
        if (!r.ok) throw new Error(value.error || "Objave trenutačno nisu dostupne.");
        if (!Array.isArray(value.results) || typeof value.indexAvailable !== "boolean") throw new Error("Neispravan odgovor pretrage.");
        if (ac.signal.aborted) return;
        if (value.indexAvailable) {
          if (cache.current.size >= 8) cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(body, { until: Date.now() + 30_000, data: value });
        }
        setOutcome({ key, data: value });
      } catch (e) {
        if (!ac.signal.aborted) setOutcome({ key, error: e instanceof Error ? e.message : "Pretraga nije uspjela." });
      }
    }, 250);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [body, key]);

  const refresh = () => { cache.current.delete(body); setRetry((v) => v + 1); };
  return <section className={styles.matches} aria-labelledby="matches-title" data-testid="indexed-results" data-area={areaId} aria-busy={!current}>
    <span className={styles.eyebrow}>{area?.name ?? "Tvoj kvart"}</span>
    <h2 id="matches-title">Objave za tebe</h2>
    <p className={styles.matchesHint}>Prema tvom profilu, samo uz poveznicu s odabranim kvartom u podacima objave.</p>
    {!current && <div className={styles.searchLoading} role="status"><span className={styles.spinner} aria-hidden="true" /> Pronalazim objave…</div>}
    {current?.error && <div role="status"><p>{current.error}</p><button className={styles.searchRetry} onClick={refresh}>Pokušaj ponovno</button></div>}
    {data && <div className={styles.searchReveal}>
      {!data.indexAvailable && <p role="status">Objave trenutačno nisu dostupne. <button onClick={refresh}>Pokušaj ponovno</button></p>}
      {data.indexAvailable && !data.searched && <p role="status">Za povezivanje objava dodaj u profil što te zanima, što tražiš ili nudiš.</p>}
      {data.indexAvailable && data.searched && !data.results.length && <p role="status" data-testid="index-empty">Još nema objava koje odgovaraju tvom profilu i odabranom kvartu u prikupljenim podacima. Objave nepoznatog kvarta ne prikazujemo.</p>}
      {!!data.results.length && <>
        <ul className={styles.matchList}>{data.results.map((r) => <li key={r.id} data-testid="matched-post" data-source={r.source}>
          <span className={styles.matchMeta}>{r.source === "demo" ? "Oglas" : r.source === "facebook" ? "Facebook" : r.source === "reddit" ? "Reddit" : "Zajednica"} · {r.areaBasis === "explicit_text" ? `Objava spominje ${area?.name}` : area?.name}</span>
          <h3>{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a> : r.title}</h3>
          <p>{r.body}</p>
        </li>)}</ul>
        <p className={styles.matchesHint}>Povezano prema riječima u profilu i objavi. Provjeri lokaciju i dostupnost kod izvora.</p>
      </>}
      {data.truncated && <p className={styles.matchesHint}>Prikazano je do 12 povezanih objava.</p>}
    </div>}
  </section>;
}
