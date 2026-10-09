"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LANG, LANGS, translate, type Key, type Lang } from "./dictionary";

const STORAGE_KEY = "kvart.lang";
const listeners = new Set<() => void>();

function read(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGS as readonly string[]).includes(saved)) return saved as Lang;
  } catch { /* storage may be blocked */ }
  return DEFAULT_LANG;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

/** HR is the server and first-paint default. The saved choice applies right after hydration. */
export function useLang() {
  const lang = useSyncExternalStore(subscribe, read, () => DEFAULT_LANG);
  // Keep <html lang> in step with the active language.
  if (typeof document !== "undefined" && document.documentElement.lang !== lang) document.documentElement.lang = lang;
  const setLang = useCallback((next: Lang) => {
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    document.documentElement.lang = next;
    listeners.forEach((l) => l());
  }, []);
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  return { lang, setLang, t };
}
