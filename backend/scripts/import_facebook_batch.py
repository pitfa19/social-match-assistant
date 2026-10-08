"""Import this approved batch to local and Railway main corpora without exposing a DB port.
Usage from backend: python scripts/import_facebook_batch.py SSH_TARGET
No provider calls. Transfers normalized rows over SSH stdin, never shell arguments.
"""
import json
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.matching.db import connect
from app.matching.pgcluster import Cluster
from app.matching.store import PostIn, import_records

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / 'backend/private-data/facebook-latest10-20261008'
EVIDENCE = ROOT / '.mozak/evidence/facebook-latest10-railway-20261008'

REMOTE = '''import json,sys
from app.matching.db import connect
from app.matching.store import PostIn,import_records
payload=json.loads(sys.stdin.read())
records=[PostIn.model_validate(r) for r in payload['records']]
with connect() as c:
 result=import_records(c,'main',records)
 rows=c.execute("SELECT external_id,content_hash FROM posts WHERE corpus='main' AND source='facebook' AND external_id=ANY(%s)",([r.external_id for r in records],)).fetchall()
 count=c.execute("SELECT count(*) AS count FROM posts WHERE corpus='main' AND source='facebook' AND external_id=ANY(%s) AND search IS NOT NULL",([r.external_id for r in records],)).fetchone()
 print(json.dumps({'import':result,'hashes':rows,'indexed':count}))
'''


def main():
    states = [json.loads(p.read_text()) for p in sorted(BATCH.glob('fb-*.json'))]
    records = [PostIn.model_validate(r) for s in states for r in s.get('records', []) if s.get('status') == 'completed']
    if not records:
        raise SystemExit('No validated records to import')
    ids = [r.external_id for r in records]
    if len(ids) != len(set(ids)):
        raise SystemExit('Duplicate source IDs need review before import')
    with connect(Cluster().dsn()) as c:
        local = import_records(c, 'main', records)
        hashes = c.execute("SELECT external_id,content_hash FROM posts WHERE corpus='main' AND source='facebook' AND external_id=ANY(%s)", (ids,)).fetchall()
    import shlex
    command = 'python -c ' + shlex.quote(REMOTE)
    proc = subprocess.run(['ssh','-o','BatchMode=yes',sys.argv[1],command],
        input=json.dumps({'records':[r.model_dump(mode='json') for r in records]}), capture_output=True,text=True,timeout=120)
    if proc.returncode:
        print('Railway import failed, local records preserved. Exit:',proc.returncode)
        print(proc.stderr[:1000])
        raise SystemExit(1)
    remote=json.loads(proc.stdout)
    same=sorted(hashes,key=lambda r:r['external_id']) == sorted(remote['hashes'],key=lambda r:r['external_id'])
    if not same or remote['indexed']['count'] != len(records):
        raise SystemExit('Railway content hash or indexed count mismatch')
    receipt={'local_import':local,'railway_import':remote['import'],'record_count':len(records),
        'matching_content_hashes':same,'railway_indexed_count':remote['indexed']['count'],
        'corpus':'main','groups_with_text':sum(bool(s.get('records')) for s in states),
        'groups':[{'source_id':s['source_id'],'canonical_url':s.get('canonical_url'),'job_id':s.get('job_id'),
                   'status':s.get('status'),'returned':s.get('returned_count'),'indexed':len(s.get('records',[])),
                   'dropped':s.get('dropped',{}),'truncated':s.get('truncated')} for s in states]}
    EVIDENCE.mkdir(parents=True,exist_ok=True)
    path=EVIDENCE/'import-receipt.json'
    with path.open('x') as f:
        json.dump(receipt,f,indent=2)
    print(json.dumps(receipt))


if __name__=='__main__':
    main()
