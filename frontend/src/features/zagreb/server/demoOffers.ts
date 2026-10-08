import type { MatchInput } from "./indexedMatches.ts";
import type { IndexedCandidate } from "../indexedSearch.ts";

/**
 * SYNTHETIC local demo adverts. Invented people, no real contact data, no external links.
 * Matches only positive request facts, only for the colloquial Trešnjevka area id.
 */
const DEMO_AREA_ID = "tresnjevka";

export type DemoOffer = IndexedCandidate & { recordKind: "synthetic" };

const DEMO_PIPE: DemoOffer = {
  id: "demo-pipe-repair-tresnjevka",
  title: "[DEMO] Ivo nudi popravak cijevi u stanu",
  body: "Izmišljeni demo oglas: Ivo, majstor za sitne vodoinstalaterske popravke (curenje cijevi, zamjena brtvi). Nije stvarna osoba.",
  source: "demo",
  url: null,
  area: DEMO_AREA_ID,
  areaBasis: "structured",
  unknown: ["kontakt", "cijena"],
  recordKind: "synthetic",
};

const DEMO_DOG: DemoOffer = {
  id: "demo-dog-walking-tresnjevka",
  title: "[DEMO] Maja nudi šetanje pasa u susjedstvu",
  body: "Izmišljeni demo oglas: Maja, susjeda koja nudi šetnje pasa radnim danom. Nije stvarna osoba.",
  source: "demo",
  url: null,
  area: DEMO_AREA_ID,
  areaBasis: "structured",
  unknown: ["kontakt", "cijena"],
  recordKind: "synthetic",
};

/** Lowercase, strip diacritics (č ć š ž đ), collapse punctuation to single spaces. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").replace(/đ/gi, "dj").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

const NEGATION = /(^| )(ne|nisam|nisi|nije|nismo|nemam|nemoj|necu|nikad|nikada|nitko|nista|bez|nimalo|ni|ne trebam|no|not|dont)( |$)/;

const DOG = /\b(pas|psa|psu|psom|psi|psima|pse|psic\w*|pasa|kuc\w*|ljubimc\w*|dog|dogs)\b/;
const WALK = /\b(setat\w*|prosetat\w*|setac\w*|setnj\w*|setanj\w*|setam\w*|setaj\w*|prosetaj\w*|izvest\w*|izvodi\w*|izvedi\w*|izvedet\w*|walk\w*)\b/;

const PIPE = /\b(cijev|cijevi|cijevima|cijevu|cijevcic\w*|vodovod\w*|pipe|pipes)\b/;
const PIPE_FIX = /\b(popravi\w*|popravak|popravk\w*|poprav\w*|sanira\w*|sanacij\w*|zamijeni\w*|zamjen\w*|curi\w*|cure|pukl\w*|puce\w*|puknu\w*|odcep\w*|fix\w*|repair\w*|leak\w*)\b/;
const PLUMBER = /\b(vodoinstalater\w*|instalater\w*|plumber)\b/;

function clauses(text: string): string[] {
  return text.split(/[.;!?,\n]+|\bali\b|\bwhile\b|\bbut\b/i).map(fold).filter(Boolean);
}

function wantsDogWalking(c: string): boolean { return DOG.test(c) && WALK.test(c); }
function wantsPipeRepair(c: string): boolean { return (PIPE.test(c) && PIPE_FIX.test(c)) || PLUMBER.test(c); }

export function matchDemoOffers(input: MatchInput): DemoOffer[] {
  if (input.areaId !== DEMO_AREA_ID) return [];
  let pipe = false;
  let dog = false;
  for (const fact of input.facts) {
    if (fact.role !== "request") continue;
    for (const c of clauses(fact.text)) {
      if (NEGATION.test(c)) continue;
      if (wantsPipeRepair(c)) pipe = true;
      if (wantsDogWalking(c)) dog = true;
    }
  }
  const out: DemoOffer[] = [];
  if (pipe) out.push({ ...DEMO_PIPE, unknown: [...DEMO_PIPE.unknown] });
  if (dog) out.push({ ...DEMO_DOG, unknown: [...DEMO_DOG.unknown] });
  return out;
}
