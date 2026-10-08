import type { Listing } from "../features/search/types.ts";

/**
 * SINTETIČKI DEMO PODACI. Nijedan zapis nije stvaran oglas ni stvarna osoba.
 * Nema URL-ova na stvarne objave. Izvori (Facebook/Reddit/zajednica) samo su oznake vrste izvora.
 */
export const ZAGREB_AREAS: readonly string[] = [
  "Trešnjevka",
  "Maksimir",
  "Novi Zagreb",
  "Donji grad",
  "Špansko",
  "Dubrava",
  "Sesvete",
  "Črnomerec",
];

const FB = "Facebook grupa (sintetički primjer)";
const RD = "Reddit zajednica (sintetički primjer)";
const CM = "Korisnički zahtjev/ponuda (sintetički primjer)";

function l(x: Omit<Listing, "provenance">): Listing {
  return { provenance: "synthetic", ...x };
}

export const LISTINGS: readonly Listing[] = [
  l({ id: "demo-01", source: "facebook", sourceLabel: FB, kind: "offer", category: "rental", title: "Jednosobni stan blizu Ribnjaka", body: "Namješten stan, 38 m2, drugi kat, grijanje na plin. Dopušteni kućni ljubimci po dogovoru.", area: "Trešnjevka", price: 480, utilities: 90 }),
  l({ id: "demo-02", source: "reddit", sourceLabel: RD, kind: "offer", category: "rental", title: "Soba u dvosobnom stanu za studenta", body: "Soba za studenta ili studenticu, zajednička kuhinja, internet uključen u pričuvu.", area: "Maksimir", price: 280, utilities: 60 }),
  l({ id: "demo-03", source: "community", sourceLabel: CM, kind: "offer", category: "rental", title: "Garsonijera u centru", body: "Mala garsonijera, renovirana, blizu tramvaja. Cijena režija nije navedena.", area: "Donji grad", price: 420, utilities: null }),
  l({ id: "demo-04", source: "facebook", sourceLabel: FB, kind: "request", category: "rental", title: "Tražim dvosoban stan, Novi Zagreb", body: "Obitelj s malim djetetom traži dvosoban stan, po mogućnosti blizu vrtića i parka.", area: "Novi Zagreb", price: null, utilities: null, priceNote: "Cijena nije navedena" }),
  l({ id: "demo-05", source: "community", sourceLabel: CM, kind: "offer", category: "rental", title: "Trosobni stan, Špansko", body: "Prostran stan, 70 m2, balkon, parking u cijeni. Dugoročni najam.", area: "Špansko", price: 650, utilities: 120 }),
  l({ id: "demo-06", source: "reddit", sourceLabel: RD, kind: "offer", category: "help", title: "Pomoć pri selidbi vikendom", body: "Dvije osobe i kombi, selidba unutar Zagreba, nosimo namještaj i kutije.", area: "Dubrava", price: 60, utilities: null, priceNote: "po satu" }),
  l({ id: "demo-07", source: "facebook", sourceLabel: FB, kind: "request", category: "help", title: "Treba mi pomoć sa slaganjem namještaja", body: "Treba pomoć pri slaganju ormara i police. Alat imam, trebam dvije ruke.", area: "Sesvete", price: 25, utilities: null, priceNote: "ukupno, okvirno" }),
  l({ id: "demo-08", source: "community", sourceLabel: CM, kind: "offer", category: "help", title: "Čuvanje biljaka i ljubimaca tijekom odmora", body: "Nudim čuvanje mačaka i zalijevanje biljaka dok ste na putu.", area: "Črnomerec", price: 10, utilities: null, priceNote: "po danu" }),
  l({ id: "demo-09", source: "reddit", sourceLabel: RD, kind: "offer", category: "tools", title: "Posudba bušilice i alata", body: "Posuđujem električnu bušilicu, set svrdla i vodenu libelu. Preuzimanje u Trešnjevci.", area: "Trešnjevka", price: 5, utilities: null, priceNote: "po danu" }),
  l({ id: "demo-10", source: "facebook", sourceLabel: FB, kind: "request", category: "tools", title: "Tražim ljestve na jedan dan", body: "Treba mi aluminijske ljestve za farbanje stropa, posudba na jedan dan.", area: "Maksimir", price: null, utilities: null }),
  l({ id: "demo-11", source: "community", sourceLabel: CM, kind: "offer", category: "tools", title: "Daram stari bicikl, treba servis", body: "Muški gradski bicikl, treba novu zračnicu i podešavanje kočnica. Poklanjam.", area: "Novi Zagreb", price: 0, utilities: null, priceNote: "besplatno" }),
  l({ id: "demo-12", source: "reddit", sourceLabel: RD, kind: "request", category: "gigs", title: "Traži se fotograf za malo događanje", body: "Radionica za dvadesetak ljudi, treba fotograf na dva sata, subota popodne.", area: "Donji grad", price: 120, utilities: null, priceNote: "ukupno" }),
  l({ id: "demo-13", source: "facebook", sourceLabel: FB, kind: "offer", category: "gigs", title: "Instrukcije iz matematike za srednju školu", body: "Studentica matematike nudi instrukcije, online ili uživo u Zagrebu.", area: null, price: 15, utilities: null, priceNote: "po satu" }),
  l({ id: "demo-14", source: "community", sourceLabel: CM, kind: "request", category: "gigs", title: "Potreban prevoditelj za kratki dokument", body: "Treba prijevod dvije stranice s engleskog na hrvatski, rok tjedan dana.", area: "Trešnjevka", price: 40, utilities: null, priceNote: "ukupno" }),
  l({ id: "demo-15", source: "reddit", sourceLabel: RD, kind: "offer", category: "gigs", title: "Izrada jednostavnih web stranica", body: "Nudim izradu jednostavne web stranice za male obrte, uključujući tekst i kontakt obrazac.", area: null, price: null, utilities: null, priceNote: "po dogovoru" }),
  l({ id: "demo-16", source: "facebook", sourceLabel: FB, kind: "offer", category: "rental", title: "Dvosoban stan, Sesvete, uz željeznicu", body: "Dvosoban stan, 52 m2, mirna ulica, 20 minuta vlakom do centra.", area: "Sesvete", price: 390, utilities: 80 }),
  l({ id: "demo-17", source: "community", sourceLabel: CM, kind: "request", category: "help", title: "Tražim pomoć oko vrta", body: "Treba pomoć pri košnji i orezivanju živice, jedan dan u mjesecu.", area: "Dubrava", price: 35, utilities: null, priceNote: "po danu" }),
];
