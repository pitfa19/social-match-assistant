// Zagreb locations. Source of truth: shared/zagreb-neighbourhoods.json, generated from official
// City of Zagreb open data (17 city districts, 218 local committees) plus 3 colloquial groups.
// The model only ever returns one of these ids. It never supplies coordinates.
// Geographic availability here is NOT source coverage: a selectable place says nothing about
// whether any Facebook group, Reddit thread or user request exists there.
import catalogue from "../../../../shared/zagreb-neighbourhoods.json" with { type: "json" };

export type NeighbourhoodKind = "district" | "local_committee" | "colloquial_group";

export type Neighbourhood = {
  id: string;
  name: string;
  hint: string;
  lat: number;
  lng: number;
  zoom: number;
  kind: NeighbourhoodKind;
  /** Official city district id. Null for colloquial groups that span several districts. */
  districtId: string | null;
  /** Spellings that explicitly name this place (official name first). */
  aliases: readonly string[];
  /** Official place is too generic to resolve on its own, for example "Centar". */
  generic: boolean;
  /** Ids of official districts that make up a colloquial group. */
  memberIds: readonly string[];
  /** Ids that earlier versions of the app used for this place. */
  legacyIds: readonly string[];
};

export const CITY_VIEW = { lat: 45.8131, lng: 15.9775, zoom: 12.4 } as const;

type RawEntry = {
  id: string;
  name: string;
  kind: NeighbourhoodKind;
  districtId: string | null;
  lat: number;
  lng: number;
  zoom: number;
  aliases: string[];
  generic: boolean;
  memberIds?: string[];
  legacyIds: string[];
};

const KIND_LABEL: Record<NeighbourhoodKind, string> = {
  district: "gradska četvrt",
  local_committee: "mjesni odbor",
  colloquial_group: "uvriježeni naziv područja",
};

const RAW = catalogue.entries as unknown as RawEntry[];
const DISTRICT_NAME = new Map(RAW.filter((e) => e.kind === "district").map((e) => [e.id, e.name]));

export const NEIGHBOURHOODS: readonly Neighbourhood[] = RAW.map((e) => {
  const parent = e.kind === "local_committee" && e.districtId ? `, ${DISTRICT_NAME.get(e.districtId)}` : "";
  return {
    id: e.id,
    name: e.name,
    hint: `${e.name} (${KIND_LABEL[e.kind]}${parent})`,
    lat: e.lat,
    lng: e.lng,
    zoom: e.zoom,
    kind: e.kind,
    districtId: e.districtId,
    aliases: e.aliases,
    generic: e.generic,
    memberIds: e.memberIds ?? [],
    legacyIds: e.legacyIds,
  };
});

export const NEIGHBOURHOOD_IDS = NEIGHBOURHOODS.map((n) => n.id);

export const CATALOGUE_META = {
  counts: catalogue.counts,
  provenance: catalogue.provenance,
} as const;

const BY_ID = new Map(NEIGHBOURHOODS.map((n) => [n.id, n]));
const BY_LEGACY = new Map(NEIGHBOURHOODS.flatMap((n) => n.legacyIds.map((l) => [l, n] as const)));

/** Current id, or an id used by an earlier version of the app. */
export function findNeighbourhood(id: string): Neighbourhood | undefined {
  return BY_ID.get(id) ?? BY_LEGACY.get(id);
}
