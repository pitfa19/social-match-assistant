# Facebook batch checkpoint, 2026-10-08

Status: PARTIAL. All 16 supplied share links were collected, ten returned posts each, using one paid POST per source. Full original named-group coverage is not complete.

## Delivered

- 160 provider rows returned. 121 text-bearing rows indexed in local PostgreSQL and Railway production, corpus `main`. 39 textless rows excluded, not replaced with additional paid collection.
- All 121 stored content hashes match across local and Railway. Generated PostgreSQL search vectors exist for all 121 rows.
- Real authenticated Railway `/matching/retrieve` checks: `stan` returned 27, `najam` returned 11, `prodajem` returned 16. All HTTP 200, all returned rows `facebook/live_imported`.
- Author objects, media and comments were not retained. Basic email/phone patterns redacted. This is not a claim that all personal data has been removed from free text.
- Existing SSH-agent public key `ubuntu-laptop` registered with Railway as `social-match-local-import`. No new private key, public database port or deployment was created.

## Identity correction observations

The original ordered name/link pairing is incorrect. Records retain provider-observed names and exact source group URLs, never inferred neighbourhood labels. The original source registry has NOT been overwritten.

| Actual provider group name | Canonical group suffix | Indexed text rows |
|---|---|---:|
| ZAKAJ VOLIM ŠPANSKO | 509647112473045 | 7 |
| Kvart Vrbani | 163289540928768 | 9 |
| MOJ KVART TRNSKO ❤️ | 1207227144192273 | 6 |
| Moj kvart - RAVNICE | 420204031510084 | 10 |
| UTRINA - moj kvart | 252041578799247 | 7 |
| Sesvete - moj kvart | 454624366267949 | 7 |
| ZAKAJ VOLIM MALEŠNICU | 1132750643466592 | 10 |
| SOPOT U SRCU | 355894824617064 | 5 |
| IZGUBLJENO/NAĐENO (Zagreb i okolica) | 186793328606455 | 9 |
| Stanovi Zagreb - NAJAM | najamzagreb | 10 |
| Pet friendly najam Zagreb | petfriendlynajam | 10 |
| Pomoć životinjama Hrvatska | 750286368918633 | 3 |
| Prodaja karata za koncerte/utakmice/manifestacije | 251668374517350 | 10 |
| Ps4/ps5 konzole, igrice i oprema | 568616104332913 | 8 |
| GRAMOFONI-Lp ploče i Singlice | 542405539794608 | 6 |
| Tražim/nudim prijevoz robe, selidbe | 102898883982315 | 4 |

## Remaining blockers and limitations

- Five original named groups have no identified link among the supplied 16: Sesvete i moj kvart; Poljanice, moj kvart; POMOĆ SIROMAŠNIMA; Pomoć azilima i napuštenim životinjama; PS3, PS4, PS5, XBOX 360... IGRICE PRODAJA ZAMJENA. Earlier reporting of three missing groups reflected the incorrect ordered mapping and is superseded by actual observed source identities.
- Malešnica's supplied link identifies ZAKAJ VOLIM MALEŠNICU, not literally the registry label Malešnica moj kvart. This correspondence is not a formal registry correction.
- Provider has no explicit newest-first parameter in its group schema. Records are sorted by returned timestamp, but absolute latest-ten completeness is not verified.
- Price observed in the live schema was $0.005 per returned record, giving $0.80 estimated for 160 rows. Actual billing ledger not checked, no top-up performed.
- All imported structured kind, city, neighbourhood and price fields remain unknown rather than inferred from group names.
- Paid collection must not be rerun to fix names or inspect already returned output. Per-source checkpoints and provider job IDs are under gitignored `backend/private-data/facebook-latest10-20261008/`.

## Resume

Obtain exact links for the five unmatched named groups. Preserve the completed batch. Any subsequent run needs its own bounded checkpoint/output path, and only then import additional records and verify the same local/Railway checks. Existing jobs may be retrieved by ID without a second paid POST. Full sequence completion must not be claimed until remaining source coverage and latest-order limitations are resolved or explicitly accepted by the owner.
