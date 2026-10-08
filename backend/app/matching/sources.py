"""Owner's source directory. Listing a URL never starts or authorizes collection."""
import json
import unicodedata
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from psycopg.types.json import Jsonb

from .db import get_db

SOURCE_FILE = Path(__file__).resolve().parents[3] / 'shared' / 'community-sources.json'
router = APIRouter(prefix='/matching', tags=['sources'])


def alias_key(value: str) -> str:
    value = unicodedata.normalize('NFKD', value.casefold().replace('đ', 'd'))
    return ' '.join(''.join(c for c in value if not unicodedata.combining(c)).split())


def seed_sources(conn) -> int:
    data = json.loads(SOURCE_FILE.read_text())
    with conn.transaction():
        for source in data['sources']:
            keys = sorted({alias_key(x) for x in [source['name'], *source['aliases'], *source['neighbourhood_ids']]})
            # Do not overwrite later human corrections to existing source records.
            conn.execute('''INSERT INTO community_sources
                (id, platform, scope, name, aliases, alias_keys, neighbourhood_ids,
                 url, canonical_url, status, provenance)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING''', (
                source['id'], source['platform'], source['scope'], source['name'], source['aliases'], keys,
                source['neighbourhood_ids'], source['url'], source['canonical_url'], source['status'],
                Jsonb({**data['provenance'], 'owner': data['owner'], 'approved_at': data['approved_at']})))
    return len(data['sources'])


@router.get('/sources')
def sources(area: str | None = Query(None, max_length=100), include_general: bool = True,
            conn=Depends(get_db)):
    if area is None:
        rows = conn.execute('SELECT * FROM community_sources ORDER BY platform, name').fetchall()
    else:
        rows = conn.execute('''SELECT * FROM community_sources
            WHERE (scope = 'neighbourhood' AND alias_keys @> ARRAY[%s]::text[])
               OR (%s AND scope = 'general') ORDER BY platform, name''',
            (alias_key(area), include_general)).fetchall()
    return {'sources': rows, 'count': len(rows), 'content_imported_by_this_request': False,
            'note': 'Source registry only, not collected posts. ordered_unverified links require identity verification before collection.'}
