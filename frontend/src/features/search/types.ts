export type Category = "rental" | "help" | "tools" | "gigs";
export type CategoryFilter = "all" | Category;
export type SourceKind = "facebook" | "reddit" | "community";
export type ListingKind = "offer" | "request";

/** Every record is synthetic fixture data. `provenance` is always "synthetic" for now. */
export interface Listing {
  id: string;
  provenance: "synthetic";
  source: SourceKind;
  sourceLabel: string;
  kind: ListingKind;
  category: Category;
  title: string;
  body: string;
  /** Zagreb district, or null when unknown. */
  area: string | null;
  /** Main price in EUR, or null when unknown. For rentals: monthly rent. */
  price: number | null;
  /** Monthly utilities in EUR (rentals only), or null when unknown. */
  utilities: number | null;
  priceNote?: string;
}

export type BudgetState =
  | { state: "empty" }
  | { state: "invalid" }
  | { state: "ok"; value: number };

export interface SearchInput {
  intent: string;
  profile: string;
  useProfile: boolean;
  category: CategoryFilter;
  /** Raw budget text as typed. */
  budget: string;
  /** "all" or a Zagreb district name. */
  area: string;
}

export interface SearchResult {
  listing: Listing;
  /** Total cost (rent + utilities) when known, else null. */
  total: number | null;
  matchedFromIntent: string[];
  matchedFromProfile: string[];
  /** Short Croatian reasons, derived only from filters and word matches. */
  reasons: string[];
}

export interface SearchOutcome {
  results: SearchResult[];
  budget: BudgetState;
  /** Listings hidden only because their price is unknown while a budget is active. */
  hiddenUnknownPrice: number;
  /** Listings that passed hard filters but had no word match (only when text query exists). */
  noWordMatch: number;
  queryWordCount: number;
  notes: string[];
}
