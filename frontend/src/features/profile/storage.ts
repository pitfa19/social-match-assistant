export const PROFILE_KEY = "sma.profile.v1";

export type StoredProfile = {
  version: 1;
  /** Text exactly as the user confirmed it. Nothing is inferred or added. */
  text: string;
  savedAt: string;
};

export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: string };

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const UNAVAILABLE =
  "Pohrana u pregledniku nije dostupna (privatni način rada ili blokirani kolačići). Profil se ne može spremiti na ovom uređaju.";

export function loadProfile(): StorageResult<StoredProfile | null> {
  const s = getStorage();
  if (!s) return { ok: false, error: UNAVAILABLE };
  try {
    const raw = s.getItem(PROFILE_KEY);
    if (!raw) return { ok: true, value: null };
    const data = JSON.parse(raw) as Partial<StoredProfile>;
    if (data && data.version === 1 && typeof data.text === "string" && data.text.trim()) {
      return {
        ok: true,
        value: { version: 1, text: data.text, savedAt: String(data.savedAt ?? "") },
      };
    }
    return { ok: false, error: "Spremljeni profil je oštećen i nije učitan. Možeš ga obrisati i ponovno se predstaviti." };
  } catch {
    return { ok: false, error: "Spremljeni profil nije moguće pročitati. Možeš ga obrisati i ponovno se predstaviti." };
  }
}

export function saveProfile(text: string): StorageResult<StoredProfile> {
  const s = getStorage();
  if (!s) return { ok: false, error: UNAVAILABLE };
  const value: StoredProfile = { version: 1, text, savedAt: new Date().toISOString() };
  try {
    s.setItem(PROFILE_KEY, JSON.stringify(value));
    return { ok: true, value };
  } catch {
    return { ok: false, error: "Profil nije spremljen jer je pohrana puna ili zaključana. Tekst je ostao u uređivaču, kopiraj ga prije zatvaranja." };
  }
}

export function deleteProfile(): StorageResult<null> {
  const s = getStorage();
  if (!s) return { ok: false, error: UNAVAILABLE };
  try {
    s.removeItem(PROFILE_KEY);
    return { ok: true, value: null };
  } catch {
    return { ok: false, error: "Profil nije obrisan. Pokušaj ponovno." };
  }
}
