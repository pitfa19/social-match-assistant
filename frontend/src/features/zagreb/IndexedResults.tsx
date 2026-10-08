"use client";

import { useEffect, useRef, useState } from "react";
import { findNeighbourhood } from "./neighbourhoods";
import { searchFacts, type MatchResponse } from "./indexedSearch";
import type { Note } from "./profileLogic";
import styles from "./Zagreb.module.css";

type Outcome = { key: string; data?: MatchResponse; error?: string };

export function IndexedResults({ areaId, notes }: { areaId: string; notes: Note[] }) {
  const [cityWide, setCityWide] = useState(false);
  const [draft, setDraft] = useState("");
  const [custom, setCustom] = useState("");
  const [kind, setKind] = useState<"request" | "offer">("request");
  const [retry, setRetry] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>({ key: "" });
  const cache = useRef(new Map<string, { until: number; data: MatchResponse }>());
  const facts = custom ? [{ text: custom, role: kind }] : searchFacts(notes);
  const body = JSON.stringify({ areaId, cityWide, facts });
  const key = `${retry}:${body}`;
  const current = outcome.key === key ? outcome : null;
  const data = current?.data;
  const area = findNeighbourhood(areaId);

  useEffect(() => {
    const ac = new AbortController();
    // Group rapid map selections/note deletions. Camera movement itself never changes this key.
    const timer = window.setTimeout(async () => {
      const saved = cache.current.get(body);
      if (saved && saved.until > Date.now()) { setOutcome({ key, data: saved.data }); return; }
      try {
        const r = await fetch("/api/zagreb/matches", { method: "POST", headers: { "content-type": "application/json" }, body, signal: ac.signal });
        const value = await r.json();
        if (!r.ok) throw new Error(value.error || "Pretraga trenutačno nije dostupna.");
        if (!Array.isArray(value.results) || !Array.isArray(value.sources) || typeof value.indexAvailable !== "boolean") throw new Error("Neispravan odgovor pretrage.");
        if (ac.signal.aborted) return;
        if (value.indexAvailable && value.sourcesAvailable) {
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
    <span className={styles.eyebrow}>POVEŽI SE SA SUSJEDSTVOM</span>
    <h2 id="matches-title">Prilike za tebe</h2>
    <p className={styles.matchesHint}>Pretražujemo postojeće objave prema tvojim bilješkama. Ne pokrećemo novo prikupljanje.</p>
    <form className={styles.searchRow} onSubmit={(e) => { e.preventDefault(); setCustom(draft.trim()); }}>
      <select aria-label="Tražim ili nudim" value={kind} onChange={(e) => setKind(e.target.value as "request" | "offer")}>
        <option value="request">Tražim</option><option value="offer">Nudim</option>
      </select>
      <input aria-label="Preciziraj pretragu" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={160} placeholder="ili preciziraj što tražiš…" />
      <button type="submit">Pretraži</button>
    </form>
    <div className={styles.searchOptions}>
      <label><input type="checkbox" checked={cityWide} onChange={(e) => setCityWide(e.target.checked)} /> Cijeli Zagreb</label>
      {custom && <button type="button" onClick={() => { setCustom(""); setDraft(""); }}>Koristi moje bilješke</button>}
    </div>
    <p className={styles.matchesHint}>Područje: {cityWide ? "Zagreb" : area?.name}. Objave bez potvrđenog kvarta označene su zasebno.</p>
    {!current && <div className={styles.searchLoading} role="status"><span className={styles.spinner} aria-hidden="true" /> Pretražujem indeks…</div>}
    {current?.error && <div role="status"><p>{current.error}</p><button className={styles.searchRetry} onClick={refresh}>Pokušaj ponovno</button></div>}
    {data && <div className={styles.searchReveal}>
      {!data.indexAvailable && <p role="status">Dio pretrage trenutačno nije dostupan. <button onClick={refresh}>Pokušaj ponovno</button></p>}
      {data.indexAvailable && !data.searched && <p role="status">Dodaj što tražiš ili nudiš za pretragu objava.</p>}
      {data.indexAvailable && data.searched && !data.results.length && <p role="status" data-testid="index-empty">Nema podudarnih indeksiranih objava za ovaj upit. To ne znači da u kvartu nema prilika.</p>}
      {!!data.results.length && <>
        <p className={styles.matchesHint}>Moguće poveznice po riječima, ne potvrđena podudaranja. Provjeri detalje i dostupnost kod izvora.</p>
        <ul className={styles.matchList}>{data.results.map((r) => <li key={r.id}>
          <span className={styles.matchMeta}>{r.source} · {r.area ? findNeighbourhood(r.area)?.name ?? r.area : "Kvart nije potvrđen"}</span>
          <h3>{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a> : r.title}</h3>
          <p>{r.body}</p>
          {r.unknown.includes("expiry") && <span className={styles.matchMeta}>Dostupnost nije potvrđena</span>}
        </li>)}</ul>
      </>}
      {data.truncated && <p className={styles.matchesHint}>Prikazano je najviše 12 kandidata. Preciziraj upit za uži izbor.</p>}
      <details className={styles.sourceDirectory}>
        <summary>Zajednice i izvori <span>{data.sources.length}</span></summary>
        <p className={styles.matchesHint}>Ovo je imenik poveznica, ne prikupljene objave. Facebook poveznice još nisu potvrđene.</p>
        {!data.sourcesAvailable ? <p>Imenik trenutačno nije dostupan. <button onClick={refresh}>Pokušaj ponovno</button></p> : !data.sources.length ? <p>Za ovo područje još nema izvora u imeniku.</p> :
          <ul className={styles.sourceList}>{data.sources.map((s) => <li key={s.id}>
            {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name} ↗</a> : <span>{s.name} · poveznica nedostaje</span>}
            <span>{s.platform}{s.status.includes("unverified") ? " · nepotvrđena poveznica" : ""}</span>
          </li>)}</ul>}
      </details>
    </div>}
  </section>;
}
