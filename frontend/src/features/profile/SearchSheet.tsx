"use client";

import SearchExperience from "../search/SearchExperience";
import { Dialog } from "./Dialog";

type Props = { profileText: string | null; onClose: () => void };

/** Accessible sheet around the search worker's component, which owns the profile toggle. */
export function SearchSheet({ profileText, onClose }: Props) {
  return (
    <Dialog title="Pretraži" titleId="search-title" onClose={onClose} wide>
      <SearchExperience profile={profileText ?? ""} onClose={onClose} />
    </Dialog>
  );
}
