"""Owner-approved bounded Facebook collection. Checkpoints prevent repeat paid POSTs.
Run from backend with python scripts/collect_facebook_batch.py [--limit N].
Raw provider bodies, authors, media, and comments are never persisted.
"""
import argparse
import asyncio
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

import httpx
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings
from app.schemas import normalize_group_url
from app.matching.store import PostIn

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'backend/private-data/facebook-latest10-20261008'
TERMINAL = {'completed', 'failed', 'cancelled', 'rejected_balance'}
# Redirect destinations observed on 2026-10-08, not inferred from group names.
RESOLVED = dict(zip(
    ['fb-vrbani','fb-trnsko','fb-ravnice','fb-utrina','fb-sesvete-moj-kvart','fb-sesvete-i-moj-kvart','fb-malesnica','fb-sopot','fb-poljanice','fb-lost-found-zagreb','fb-stanovi-zagreb','fb-pet-friendly-najam','fb-pomoc-zivotinjama','fb-pomoc-siromasnima','fb-pomoc-azilima','fb-prodaja-karata'],
    ['509647112473045','163289540928768','1207227144192273','420204031510084','252041578799247','454624366267949','1132750643466592','355894824617064','186793328606455','najamzagreb','petfriendlynajam','750286368918633','251668374517350','568616104332913','542405539794608','102898883982315']))


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def normalize(row, group, job_id, secret):
    url = str(row.get('postUrl') or '')
    parts = urlsplit(url)
    if parts.scheme != 'https' or parts.hostname not in {'facebook.com', 'www.facebook.com'} or parts.username or parts.password:
        raise ValueError('invalid_post_url')
    source = row.get('source') or {}
    source_url = str(source.get('url') or '').split('?')[0].rstrip('/')
    group_path = urlsplit(group).path.rstrip('/')
    if source_url.rstrip('/') != group.rstrip('/') and not parts.path.startswith(group_path + '/'):
        raise ValueError('unconfirmed_group')
    external_id = str(row.get('postId') or '')
    if not external_id or len(external_id) > 200:
        raise ValueError('invalid_id')
    posted = datetime.fromisoformat(str(row.get('postedAt') or '').replace('Z', '+00:00'))
    if posted.tzinfo is None or posted > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError('invalid_date')
    text = str(row.get('text') or '').strip()
    if not text:
        raise ValueError('no_text')
    if secret:
        text = text.replace(secret, '[redacted]')
    text = re.sub(r'\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b', '[email removed]', text)
    text = re.sub(r'(?<!\w)(?:\+\d[\d ()/.-]{7,}\d|0\d[\d ()/.-]{7,}\d)(?!\w)', '[phone removed]', text)
    return PostIn(source='facebook', record_kind='live_imported', external_id=external_id,
        title=text[:300], body=text[:4000], posted_at=posted, url=url[:400],
        provenance={'provider':'mindcase', 'job_id':job_id, 'source_group_url':group,
                    'source_name':str(source.get('name') or '')[:300], 'untrusted_content':True,
                    'owner_request_at':'2026-10-08T15:24:23.710Z',
                    'paid_approval_at':'2026-10-08T15:25:46.170Z',
                    'fetched_at':datetime.now(timezone.utc).isoformat(),
                    'latest_order_verified':False, 'text_truncated':len(text)>4000}).model_dump(mode='json')


async def collect(source, sem):
    path = OUT / (source['id'] + '.json')
    async with sem:
        settings = get_settings()
        state = json.loads(path.read_text()) if path.exists() else {'source_id':source['id'],'share_url':source['url']}
        if state.get('finished'):
            print(json.dumps({'source_id':source['id'],'status':state['status'],'kept':len(state.get('records',[]))}), flush=True)
            return
        if state.get('submitted') and not state.get('job_id'):
            print(json.dumps({'source_id':source['id'],'status':'submission_uncertain_no_retry'}), flush=True)
            return
        try:
            async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
                if not state.get('canonical_url'):
                    state['canonical_url'] = normalize_group_url('https://www.facebook.com/groups/' + RESOLVED[source['id']])
                    save(path,state)
                if not settings.api_key:
                    raise ValueError('missing_api_key')
                headers={'Authorization':'Bearer '+settings.api_key}
                if not state.get('submitted'):
                    state.update(submitted=True, submitted_at=datetime.now(timezone.utc).isoformat())
                    save(path,state)
                    response=await client.post(settings.base_url+'/data/facebook/posts/run',params={'wait':'true'},headers=headers,
                        json={'params':{'groupUrls':state['canonical_url'],'maxResults':10}})
                    if response.status_code >= 300:
                        state.update(status='http_'+str(response.status_code),finished=True)
                        save(path,state)
                        print(json.dumps({'source_id':source['id'],'status':state['status']}),flush=True)
                        return
                    body=response.json()
                    state['job_id']=body.get('job_id') or body.get('id')
                    state['status']=body.get('status')
                    save(path,state)
                else:
                    response=await client.get(settings.base_url+'/jobs/'+state['job_id']+'/results',headers=headers)
                    response.raise_for_status()
                    body=response.json()
                for _ in range(90):
                    if body.get('status') in TERMINAL:
                        break
                    if not state.get('job_id'):
                        raise ValueError('no_job_id')
                    await asyncio.sleep(4)
                    response=await client.get(settings.base_url+'/jobs/'+state['job_id']+'/results',headers=headers)
                    response.raise_for_status()
                    body=response.json()
                    state['status']=body.get('status')
                    save(path,state)
                state['status']=body.get('status','unknown')
                state['truncated']=bool(body.get('truncated'))
                rows=body.get('data',[])
                state['response_keys']=list(body.keys())
                state['row_keys']=list(rows[0].keys()) if isinstance(rows,list) and rows and isinstance(rows[0],dict) else []
                state['returned_count']=len(rows) if isinstance(rows,list) else None
                records=[]
                dropped={}
                if state['status']=='completed' and isinstance(rows,list):
                    for row in rows[:10]:
                        try:
                            records.append(normalize(row,state['canonical_url'],state.get('job_id'),settings.api_key))
                        except (ValueError,TypeError,AttributeError) as e:
                            reason=str(e) if isinstance(e,ValueError) and len(str(e))<50 else type(e).__name__
                            dropped[reason]=dropped.get(reason,0)+1
                state['records']=sorted(records,key=lambda r:r['posted_at'],reverse=True)
                state['dropped']=dropped
                state['finished']=state['status'] in TERMINAL
                save(path,state)
                print(json.dumps({k:v for k,v in state.items() if k not in {'records','share_url'}},ensure_ascii=False),flush=True)
        except Exception as e:
            state['last_error']=type(e).__name__
            save(path,state)
            print(json.dumps({'source_id':source['id'],'error':type(e).__name__,'job_id':state.get('job_id')}),flush=True)


async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--limit',type=int,default=16)
    args=parser.parse_args()
    sources=json.loads((ROOT/'shared/community-sources.json').read_text())['sources']
    selected=[s for s in sources if s['platform']=='facebook' and s['url']][:args.limit]
    sem=asyncio.Semaphore(4)
    await asyncio.gather(*(collect(s,sem) for s in selected))


if __name__=='__main__':
    import fcntl
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / '.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        asyncio.run(main())
