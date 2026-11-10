#!/usr/bin/env python3
"""Fetch primary-source snapshots. No auth, models, or user config."""
import argparse,concurrent.futures,datetime,hashlib,json,pathlib,subprocess
p=argparse.ArgumentParser();p.add_argument('--cache',default=str(pathlib.Path(__file__).resolve().parents[4]/'.cache/host-adapter-study/hosts/docs'));p.add_argument('--only',default='');a=p.parse_args()
out=pathlib.Path(__file__).resolve().parent;cache=pathlib.Path(a.cache);cache.mkdir(parents=True,exist_ok=True)
items=json.loads((out/'sources.json').read_text())
if a.only: items=[x for x in items if a.only in x['id']]
def fetch(x):
 path=cache/(x['id']+'.body');headers=cache/(x['id']+'.headers');err=cache/(x['id']+'.stderr')
 argv=['curl','-4','--location','--silent','--show-error','--connect-timeout','8','--max-time','25','--user-agent','host-capabilities-research/1.0','--dump-header',str(headers),'--output',str(path),'--write-out','%{json}',x['url']]
 now=datetime.datetime.now(datetime.timezone.utc).isoformat();r=subprocess.run(argv,capture_output=True,text=True)
 err.write_text(r.stderr);row={**x,'fetched_at_utc':now,'argv':argv,'exit_code':r.returncode,'stderr':r.stderr,'body_cache':str(path),'headers_cache':str(headers)}
 try:
  full=json.loads(r.stdout);raw=cache/(x['id']+'.curl.json');raw.write_text(r.stdout);row['curl_raw_sha256']=hashlib.sha256(r.stdout.encode()).hexdigest();row['curl_raw_cache']=str(raw);row['http']={k:full.get(k) for k in ['http_code','url_effective','num_redirects','remote_ip','ssl_verify_result','time_total']}
 except ValueError: row['stdout']=r.stdout
 if path.exists(): row.update(bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
 print(json.dumps({k:row.get(k) for k in ['id','exit_code','sha256','bytes']},ensure_ascii=False),flush=True);return row
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool: rows=list(pool.map(fetch,items))
manifest=out/'fetch-manifest.json'
old=json.loads(manifest.read_text()) if manifest.exists() else [];new={x['id']:x for x in old};new.update({x['id']:x for x in rows});manifest.write_text(json.dumps(list(new.values()),ensure_ascii=False,indent=2)+'\n')
