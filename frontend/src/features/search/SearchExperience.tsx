"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LISTINGS, ZAGREB_AREAS } from "../../fixtures/listings.ts";
import {
  CATEGORY_LABELS,
  buildDraft,
  createSavedStore,
  formatPrice,
  search,
} from "./logic.ts";
import type { CategoryFilter, Listing, SearchResult } from "./types.ts";
import styles from "./SearchExperience.module.css";

export interface SearchExperienceProps {
  /** Confirmed profile text. Empty string when there is none. */
  profile: string;
  /** The hosting dialog owns the close control and Escape at the top level. */
  onClose: () => void;
}

const CATEGORIES: CategoryFilter[] = ["all", "rental", "help", "tools", "gigs"];
const KIND_LABEL = { offer: "Ponuda", request: "Zahtjev" } as const;
const SOURCE_BADGE = { facebook: "Facebook", reddit: "Reddit", community: "Zajednica" } as const;

type View = "results" | "saved";

export default function SearchExperience({ profile }: SearchExperienceProps) {
  const hasProfile = profile.trim() !== "";
  const [intent, setIntent] = useState("");
  const [useProfile, setUseProfile] = useState(hasProfile);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [budget, setBudget] = useState("");
  const [area, setArea] = useState("all");
  const [submitted, setSubmitted] = useState<null | {
    intent: string; useProfile: boolean; category: CategoryFilter; budget: string; area: string;
  }>(null);
  const [view, setView] = useState<View>("results");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [storeMsg, setStoreMsg] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const store = useMemo(() => createSavedStore(), []);

  useEffect(() => {
    const r = store.load();
    setSavedIds(r.ids);
    setStoreMsg(r.error);
  }, [store]);

  useEffect(() => {
    if (!hasProfile) setUseProfile(false);
  }, [hasProfile]);

  const outcome = useMemo(
    () =>
      submitted
        ? search({
            intent: submitted.intent,
            profile,
            useProfile: submitted.useProfile && hasProfile,
            category: submitted.category,
            budget: submitted.budget,
            area: submitted.area,
          })
        : null,
    [submitted, profile, hasProfile],
  );

  const savedListings: Listing[] = useMemo(
    () => savedIds.map((id) => LISTINGS.find((l) => l.id === id)).filter((l): l is Listing => !!l),
    [savedIds],
  );
  const selected: Listing | null = useMemo(
    () => LISTINGS.find((l) => l.id === selectedId) ?? null,
    [selectedId],
  );
  const selectedResult: SearchResult | null =
    outcome?.results.find((r) => r.listing.id === selectedId) ?? null;

  const runSearch = useCallback(() => {
    setSubmitted({ intent, useProfile, category, budget, area });
    setView("results");
    setSelectedId(null);
    setDraftOpen(false);
  }, [intent, useProfile, category, budget, area]);

  const toggleSave = (id: string) => {
    const next = savedIds.includes(id) ? savedIds.filter((x) => x !== id) : [...savedIds, id];
    setSavedIds(next);
    setStoreMsg(store.save(next));
  };

  const openDraft = () => {
    setDraft(
      buildDraft({
        intent: submitted?.intent ?? intent,
        profile,
        useProfile: (submitted?.useProfile ?? useProfile) && hasProfile,
        listing: selected,
      }),
    );
    setCopyMsg(null);
    setDraftOpen(true);
  };

  useEffect(() => {
    if (draftOpen) draftRef.current?.focus();
  }, [draftOpen]);
  useEffect(() => {
    if (selectedId && !draftOpen) detailRef.current?.focus();
  }, [selectedId, draftOpen]);

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyMsg("Kopirano.");
    } catch {
      draftRef.current?.focus();
      draftRef.current?.select();
      setCopyMsg("Kopiranje nije dostupno. Tekst je označen, pritisnite Ctrl+C (ili Cmd+C).");
    }
  };

  /** Escape steps back one inner layer. At the top level it is left to the hosting dialog. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (draftOpen) {
      setDraftOpen(false);
    } else if (selectedId) {
      setSelectedId(null);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const demoNote = (
    <div className={styles.note}>
      <p role="note" className={styles.demoNote}>Demo pretraga · sintetički zapisi</p>
      <details className={styles.about}>
        <summary>O demonstraciji</summary>
        <p>
          Zapisi nisu stvarni oglasi i nemaju poveznice na izvore. Nema uživo uvoza ni stvarne
          umjetne inteligencije. Podudaranje se temelji samo na filterima i zajedničkim riječima.
        </p>
      </details>
    </div>
  );

  // ---------- Draft view ----------
  if (draftOpen) {
    return (
      <div className={styles.root} onKeyDown={onKeyDown}>
        <label className={styles.field}>
          <span>Nacrt objave (uredite po želji)</span>
          <textarea
            ref={draftRef}
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Tekst objave"
          />
        </label>
        <p className={styles.muted}>
          Samo vaš tekst i odabrani demo zapis. Dopunite polja u uglatim zagradama. Ništa se ne objavljuje.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={copyDraft}>Kopiraj</button>
          <button type="button" className={styles.secondary} onClick={() => setDraftOpen(false)}>Natrag</button>
        </div>
        {copyMsg && <p role="status" className={styles.muted}>{copyMsg}</p>}
      </div>
    );
  }

  // ---------- Detail view ----------
  if (selected) {
    const isSaved = savedIds.includes(selected.id);
    return (
      <div className={styles.root} onKeyDown={onKeyDown}>
        <aside ref={detailRef} tabIndex={-1} className={styles.detail} aria-label={`Detalji: ${selected.title}`}>
          <p className={styles.badges}>
            <span className={styles.demo}>DEMO</span>
            <span className={styles.src}>{SOURCE_BADGE[selected.source]}</span>
          </p>
          <h3>{selected.title}</h3>
          <p>{selected.body}</p>
          <dl className={styles.dl}>
            <dt>Izvor (oznaka)</dt><dd>{selected.sourceLabel}</dd>
            <dt>Vrsta</dt><dd>{KIND_LABEL[selected.kind]}</dd>
            <dt>Kategorija</dt><dd>{CATEGORY_LABELS[selected.category]}</dd>
            <dt>Područje</dt><dd>{selected.area ?? "Nije navedeno"}</dd>
            <dt>Cijena</dt><dd>{formatPrice(selected)}</dd>
            {selectedResult && selectedResult.total !== null && selected.category === "rental" && (
              <><dt>Ukupno mjesečno</dt><dd>{selectedResult.total} €</dd></>
            )}
          </dl>
          {selectedResult && (
            <>
              <h4 className={styles.sub}>Zašto se podudara</h4>
              <ul className={styles.reasons}>{selectedResult.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </>
          )}
          <p className={styles.muted}>Jasno DEMO · sintetički zapis, nije stvaran oglas.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => toggleSave(selected.id)}>
              {isSaved ? "Ukloni iz spremljenog" : "Spremi"}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setSelectedId(null)}>Natrag</button>
            <button type="button" className={styles.link} onClick={openDraft}>Pomozi mi napisati objavu</button>
          </div>
          {storeMsg && <p className={styles.warn} role="alert">{storeMsg}</p>}
        </aside>
      </div>
    );
  }

  // ---------- Search view ----------
  const list: { listing: Listing; result?: SearchResult }[] =
    view === "saved"
      ? savedListings.map((listing) => ({ listing }))
      : (outcome?.results ?? []).map((r) => ({ listing: r.listing, result: r }));

  return (
    <div className={styles.root} onKeyDown={onKeyDown}>
      {demoNote}

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <label className={styles.field}>
          <span>Što trenutno tražite ili nudite?</span>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            rows={2}
            placeholder="Npr. tražim jeftin stan u Zagrebu ili posudbu bušilice"
          />
        </label>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={useProfile && hasProfile}
            disabled={!hasProfile}
            onChange={(e) => setUseProfile(e.target.checked)}
          />
          <span>
            Koristi moj profil
            {!hasProfile && <em> (nema profila)</em>}
          </span>
        </label>

        <details className={styles.filters}>
          <summary>Filtri</summary>
          <div className={styles.row}>
            <fieldset className={styles.chips}>
              <legend>Kategorija</legend>
              {CATEGORIES.map((c) => (
                <label key={c} className={category === c ? styles.chipOn : styles.chip}>
                  <input
                    type="radio"
                    name="sma-category"
                    value={c}
                    checked={category === c}
                    onChange={() => setCategory(c)}
                  />
                  {CATEGORY_LABELS[c]}
                </label>
              ))}
            </fieldset>
            <label className={styles.field}>
              <span>Ukupni proračun (€)</span>
              <input
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Za najam: najam + režije"
                aria-describedby="sma-budget-hint"
              />
              <small id="sma-budget-hint">Prazno znači bez ograničenja.</small>
            </label>
            <label className={styles.field}>
              <span>Područje Zagreba</span>
              <select value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="all">Cijeli Zagreb</option>
                {ZAGREB_AREAS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <div className={styles.actions}>
          <button type="submit" className={styles.primary}>Pronađi</button>
          <button type="button" className={styles.link} onClick={openDraft}>
            Pomozi mi napisati objavu
          </button>
        </div>
      </form>

      <div className={styles.tabs} role="tablist" aria-label="Prikaz">
        <button
          type="button" role="tab" aria-selected={view === "results"}
          className={view === "results" ? styles.tabOn : styles.tab}
          onClick={() => setView("results")}
        >
          Rezultati{outcome ? ` (${outcome.results.length})` : ""}
        </button>
        <button
          type="button" role="tab" aria-selected={view === "saved"}
          className={view === "saved" ? styles.tabOn : styles.tab}
          onClick={() => setView("saved")}
        >
          Spremljeno ({savedListings.length})
        </button>
      </div>

      {storeMsg && <p className={styles.warn} role="alert">{storeMsg}</p>}
      {view === "results" && outcome?.notes.map((n) => (
        <p key={n} className={styles.warn} role="alert">{n}</p>
      ))}

      <section aria-live="polite" aria-label="Popis">
        {view === "results" && !outcome && (
          <p className={styles.muted}>Upišite što tražite i pokrenite pretragu. Možete i bez profila.</p>
        )}
        {view === "results" && outcome && list.length === 0 && (
          <div className={styles.empty}>
            <p><strong>Nema rezultata u demo skupu.</strong></p>
            {outcome.hiddenUnknownPrice > 0 && (
              <p>
                {outcome.hiddenUnknownPrice} zapis(a) skriveno jer cijena nije navedena, a proračun je
                postavljen. Nepoznata cijena se ne pogađa.
              </p>
            )}
            <p>Pokušajte promijeniti riječi, kategoriju, područje ili proračun.</p>
          </div>
        )}
        {view === "results" && outcome && list.length > 0 && outcome.hiddenUnknownPrice > 0 && (
          <p className={styles.muted}>
            {outcome.hiddenUnknownPrice} zapis(a) skriveno jer cijena nije navedena.
          </p>
        )}
        {view === "saved" && list.length === 0 && (
          <p className={styles.muted}>Još nema spremljenih stavki.</p>
        )}
        <ul className={styles.items}>
          {list.map(({ listing, result }) => (
            <li key={listing.id} className={styles.item}>
              <p className={styles.badges}>
                <span className={styles.demo}>DEMO</span>
                <span className={styles.src}>{SOURCE_BADGE[listing.source]}</span>
              </p>
              <h3>{listing.title}</h3>
              <p className={styles.meta}>
                {KIND_LABEL[listing.kind]} · {CATEGORY_LABELS[listing.category]} · {listing.area ?? "Područje nije navedeno"} · {formatPrice(listing)}
                {listing.category === "rental" && result && result.total !== null && ` · ukupno ${result.total} €`}
              </p>
              <div className={styles.rowActions}>
                <button type="button" className={styles.ghost} onClick={() => setSelectedId(listing.id)}>
                  Detalji
                </button>
                <button
                  type="button" className={styles.ghost}
                  aria-pressed={savedIds.includes(listing.id)}
                  onClick={() => toggleSave(listing.id)}
                >
                  {savedIds.includes(listing.id) ? "Ukloni iz spremljenog" : "Spremi"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
