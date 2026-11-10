#!/usr/bin/env python3
"""Offline CLI discovery only. Isolated HOME/XDG/CODEX_HOME; no prompts/model calls."""
import argparse,datetime,hashlib,json,os,pathlib,platform,shutil,subprocess
p=argparse.ArgumentParser();p.add_argument('--cache',default=str(pathlib.Path(__file__).resolve().parents[4]/'.cache/host-adapter-study/hosts/probes'));a=p.parse_args()
base=pathlib.Path(a.cache).resolve();base.mkdir(parents=True,exist_ok=True)
out=pathlib.Path(__file__).resolve().parent
commands={'claude':[['--version'],['--help'],['plugin','--help']],'codex':[['--version'],['--help'],['features','list'],['mcp','--help']],'opencode':[['--version'],['--help'],['debug','--help'],['debug','skill']],'copilot':[['--version'],['--help'],['plugin','--help']]}
rows=[]
for name,variants in commands.items():
 exe=shutil.which(name)
 if not exe: rows.append({'host':name,'available':False});continue
 for n,args in enumerate(variants):
  root=base/(name+'-'+str(n));root.mkdir(parents=True,exist_ok=True);home=root/'home';cwd=root/'project';home.mkdir(exist_ok=True);cwd.mkdir(exist_ok=True);(home/'codex').mkdir(exist_ok=True)
  env={k:v for k,v in os.environ.items() if k in ['PATH','SHELL','TMPDIR','LANG','LC_ALL','TERM','SYSTEMROOT']}
  env.update(HOME=str(home),XDG_CONFIG_HOME=str(home/'config'),XDG_CACHE_HOME=str(home/'cache'),XDG_DATA_HOME=str(home/'data'),CODEX_HOME=str(home/'codex'),NO_COLOR='1',DO_NOT_TRACK='1')
  argv=[exe]+args;start=datetime.datetime.now(datetime.timezone.utc).isoformat()
  try:
   r=subprocess.run(argv,cwd=cwd,env=env,capture_output=True,text=True,timeout=20);stdout=r.stdout;stderr=r.stderr;code=r.returncode
  except subprocess.TimeoutExpired as e: stdout=str(e.stdout or '');stderr=str(e.stderr or '');code='timeout'
  (root/'stdout.txt').write_text(stdout);(root/'stderr.txt').write_text(stderr)
  tree=[]
  for f in sorted(home.rglob('*')):
   if f.is_file(): tree.append({'path':str(f.relative_to(home)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
  row={'host':name,'argv':argv,'cwd':str(cwd),'at_utc':start,'env':env,'exit_code':code,'stdout':stdout,'stderr':stderr,'home_tree':tree,'executable_realpath':str(pathlib.Path(exe).resolve()),'executable_sha256':hashlib.sha256(pathlib.Path(exe).resolve().read_bytes()).hexdigest()};rows.append(row);print(json.dumps({'argv':argv,'exit_code':code,'stdout':stdout[:1500],'stderr':stderr[:300]},ensure_ascii=False),flush=True)
(base.parent/'probe-results.full.json').write_text(json.dumps({'platform':platform.platform(),'machine':platform.machine(),'python':platform.python_version(),'results':rows},ensure_ascii=False,indent=2)+'\n')
