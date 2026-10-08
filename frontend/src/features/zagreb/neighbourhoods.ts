// Fixed, curated neighbourhood anchors (approximate centre points, hand-entered).
// The model only ever returns one of these ids. It never supplies coordinates.
export type Neighbourhood = {
  id: string;
  name: string;
  hint: string;
  lat: number;
  lng: number;
  zoom: number;
};

export const CITY_VIEW = { lat: 45.8131, lng: 15.9775, zoom: 12.4 } as const;

export const NEIGHBOURHOODS: readonly Neighbourhood[] = [
  { id: "donji-grad", name: "Donji grad", hint: "Donji grad (Donji Grad)", lat: 45.8085, lng: 15.9770, zoom: 15.6 },
  { id: "gornji-grad", name: "Gornji grad", hint: "Gornji grad (Gornji Grad)", lat: 45.8160, lng: 15.9745, zoom: 15.8 },
  { id: "trnje", name: "Trnje", hint: "Trnje", lat: 45.7985, lng: 15.9930, zoom: 14.8 },
  { id: "tresnjevka", name: "Trešnjevka", hint: "Trešnjevka (Tresnjevka, Trešnjevka sjever, Trešnjevka jug)", lat: 45.8000, lng: 15.9470, zoom: 14.8 },
  { id: "maksimir", name: "Maksimir", hint: "Maksimir", lat: 45.8190, lng: 16.0150, zoom: 14.6 },
  { id: "crnomerec", name: "Črnomerec", hint: "Črnomerec (Crnomerec)", lat: 45.8250, lng: 15.9300, zoom: 14.4 },
  { id: "jarun", name: "Jarun", hint: "Jarun", lat: 45.7850, lng: 15.9290, zoom: 14.6 },
  { id: "novi-zagreb", name: "Novi Zagreb", hint: "Novi Zagreb (Novi Zagreb istok, Novi Zagreb zapad)", lat: 45.7760, lng: 15.9780, zoom: 13.9 },
  { id: "pescenica", name: "Peščenica", hint: "Peščenica (Pescenica, Peščenica Žitnjak)", lat: 45.8040, lng: 16.0420, zoom: 14.2 },
  { id: "dubrava", name: "Dubrava", hint: "Dubrava (Gornja Dubrava, Donja Dubrava)", lat: 45.8350, lng: 16.0560, zoom: 14.2 },
  { id: "sesvete", name: "Sesvete", hint: "Sesvete", lat: 45.8300, lng: 16.1100, zoom: 14.0 },
] as const;

export const NEIGHBOURHOOD_IDS = NEIGHBOURHOODS.map((n) => n.id);

export function findNeighbourhood(id: string): Neighbourhood | undefined {
  return NEIGHBOURHOODS.find((n) => n.id === id);
}
