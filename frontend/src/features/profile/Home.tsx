"use client";

import { useCallback, useEffect, useState } from "react";
import { SearchIcon, UserIcon } from "../../components/Icons";
import { IntroChat } from "./IntroChat";
import { ProfileSheet } from "./ProfileSheet";
import { SearchSheet } from "./SearchSheet";
import { deleteProfile, loadProfile, saveProfile, type StoredProfile } from "./storage";

type Open = null | "intro" | "profile" | "search";

export function Home() {
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => {
    const r = loadProfile();
    if (r.ok) setProfile(r.value);
    else setStorageError(r.error);
    setReady(true);
  }, []);

  const save = useCallback((text: string) => {
    const r = saveProfile(text);
    if (!r.ok) return r.error;
    setProfile(r.value);
    setStorageError(null);
    setOpen(null);
    return null;
  }, []);

  const remove = useCallback(() => {
    const r = deleteProfile();
    if (!r.ok) return r.error;
    setProfile(null);
    setOpen(null);
    return null;
  }, []);

  const close = useCallback(() => setOpen(null), []);

  return (
    <main className="page">
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title" className="hero-title">
          Pronađi što ti odgovara.
        </h1>
        <p className="lede">Tvoj profil. Tvoja pretraga.</p>
        <div className="cta-row">
          {ready && profile ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setOpen("profile")} data-testid="open-profile">
              <UserIcon /> Profil
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => setOpen("intro")}
              data-testid="open-intro"
              disabled={!ready}
            >
              <UserIcon /> Predstavi se
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => setOpen("search")} data-testid="open-search">
            <SearchIcon /> Pretraži
          </button>
        </div>
        {storageError && (
          <p role="alert" className="error banner">
            {storageError}
          </p>
        )}
      </section>

      <footer className="foot">Demo · sintetički podaci</footer>

      {open === "intro" && <IntroChat onClose={close} onSave={save} />}
      {open === "profile" && profile && (
        <ProfileSheet profile={profile} onClose={close} onSave={save} onDelete={remove} />
      )}
      {open === "search" && <SearchSheet profileText={profile?.text ?? null} onClose={close} />}
    </main>
  );
}
