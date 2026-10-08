import json

from fastapi.testclient import TestClient

from app.main import app
from app.matching import db
from app.matching.sources import SOURCE_FILE, alias_key, seed_sources
from test_matching import cluster, conn, client  # reuse isolated, real PostgreSQL fixture


def test_complete_owner_source_registry():
    data = json.loads(SOURCE_FILE.read_text())
    rows = data['sources']
    assert len(rows) == 21
    fb = [x for x in rows if x['platform'] == 'facebook']
    assert len(fb) == 19 and sum(bool(x['url']) for x in fb) == 16
    assert len({x['url'] for x in fb if x['url']}) == 16
    assert all(x['status'] != 'verified' for x in fb)
    assert all(x['scope'] == 'general' and x['neighbourhood_ids'] == [] for x in rows if x['platform'] == 'reddit')
    catalogue = json.loads((SOURCE_FILE.parent / 'zagreb-neighbourhoods.json').read_text())
    ids = {x['id'] for x in catalogue['entries']}
    assert all(set(x['neighbourhood_ids']) <= ids for x in rows)


def test_seed_persists_and_does_not_duplicate_or_overwrite_review(conn, cluster):
    seed_sources(conn)
    seed_sources(conn)
    assert conn.execute('SELECT count(*) n FROM community_sources').fetchone()['n'] == 21
    conn.execute("UPDATE community_sources SET status='verified' WHERE id='fb-vrbani'")
    seed_sources(conn)
    with db.connect(cluster.dsn()) as reopened:
        assert reopened.execute("SELECT status FROM community_sources WHERE id='fb-vrbani'").fetchone()['status'] == 'verified'


def test_aliases_and_general_scope(client, conn):
    seed_sources(conn)
    for alias in ['Malešnica', 'malesnica', 'mo-malesnica', ' MO Malešnica ']:
        r = client.get('/matching/sources', params={'area': alias, 'include_general': 'false'})
        assert r.status_code == 200
        assert [x['id'] for x in r.json()['sources']] == ['fb-malesnica']
    data = client.get('/matching/sources', params={'area': 'Sesvete', 'include_general': 'false'}).json()
    assert data['count'] == 2
    data = client.get('/matching/sources', params={'area': 'Vrbani'}).json()
    assert {x['id'] for x in data['sources']} >= {'fb-vrbani', 'reddit-zagreb', 'reddit-askcroatia'}
    assert not data['content_imported_by_this_request']
    unknown = client.get('/matching/sources', params={'area': "'; DROP TABLE community_sources; --", 'include_general': 'false'})
    assert unknown.json()['count'] == 0


def test_alias_folding():
    assert alias_key('  MALEŠNICA  ') == 'malesnica'
    assert alias_key('Nađeno') == 'nadeno'


def test_private_backend_fails_closed(monkeypatch):
    monkeypatch.setenv('APP_REQUIRE_AUTH', 'true')
    monkeypatch.delenv('BACKEND_ACCESS_TOKEN', raising=False)
    with TestClient(app) as c:
        assert c.get('/health').status_code == 200
        assert c.get('/matching/neighbourhoods').status_code == 503
        monkeypatch.setenv('BACKEND_ACCESS_TOKEN', 'test-token-' + 'x' * 32)
        assert c.get('/matching/neighbourhoods').status_code == 401
        assert c.get('/matching/neighbourhoods', headers={'authorization': 'Bearer test-token-' + 'x' * 32}).status_code == 200
        assert c.post('/scrapes/facebook-group', json={}).status_code == 401


def test_managed_database_fails_closed(monkeypatch):
    monkeypatch.setenv('APP_REQUIRE_AUTH', 'true')
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.delenv('MATCHING_DATABASE_URL', raising=False)
    import pytest
    with pytest.raises(RuntimeError):
        db.dsn()
