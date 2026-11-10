#!/usr/bin/env python3
"""No model calls: OpenCode debug skill and Codex app-server skills/list."""
import argparse,datetime,hashlib,json,os,pathlib,selectors,shutil,subprocess,tempfile,time
out=pathlib.Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--cache',default=str(pathlib.Path(__file__).resolve().parents[4]/'.cache/host-adapter-study/hosts/discovery'));args=parser.parse_args()
cache=pathlib.Path(args.cache).resolve();cache.mkdir(parents=True,exist_ok=True)
root=pathlib.Path(tempfile.mkdtemp(prefix='host-capability-discovery-'));home=root/'home';project=root/'project';home.mkdir();project.mkdir();(home/'codex').mkdir();subprocess.run(['git','init','-q',str(project)],check=True)
def skill(base,name,body='fixture'):
 p=base/name/'SKILL.md';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(f'---\nname: {name}\ndescription: Test discovery fixture {name}\n---\n{body}\n');return p
for loc,name in [('.agents/skills','project-agents'),('.claude/skills','project-claude'),('.opencode/skills','project-opencode'),('.codex/skills','project-codex'),('.github/skills','project-github')]:skill(project/loc,name)
for loc,name in [('.agents/skills','global-agents'),('.claude/skills','global-claude'),('config/opencode/skills','global-opencode'),('codex/skills','global-codex')]:skill(home/loc,name)
(project/'AGENTS.md').write_text('Host capability fixture; no model requests.\n')
env={k:v for k,v in os.environ.items() if k in ['PATH','SHELL','TMPDIR','LANG','LC_ALL','TERM']};env.update(HOME=str(home),XDG_CONFIG_HOME=str(home/'config'),XDG_CACHE_HOME=str(home/'cache'),XDG_DATA_HOME=str(home/'data'),CODEX_HOME=str(home/'codex'),NO_COLOR='1',DO_NOT_TRACK='1',CI='1')
def tree():
 return [{'path':str(f.relative_to(root)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(root.rglob('*')) if f.is_file() and '.git' not in f.parts]
before=tree();rows=[]
for name,args in [('opencode',['debug','skill']),('codex',['features','list']),('codex',['app-server','--help']),('codex',['plugin','--help'])]:
 exe=shutil.which(name)
 if not exe: rows.append({'host':name,'available':False,'requested_args':args});continue
 argv=[exe]+args;prefix=name+'-'+args[0];so=cache/(prefix+'.stdout');se=cache/(prefix+'.stderr')
 with so.open('w') as o,se.open('w') as e:
  try:r=subprocess.run(argv,cwd=project,env=env,stdout=o,stderr=e,timeout=25);code=r.returncode
  except subprocess.TimeoutExpired:code='timeout'
 row={'argv':argv,'cwd':str(project),'exit_code':code,'stdout_file':str(so),'stderr_file':str(se),'stdout_sha256':hashlib.sha256(so.read_bytes()).hexdigest(),'stderr_sha256':hashlib.sha256(se.read_bytes()).hexdigest()};rows.append(row)
 if name=='opencode':
  try:row['discovered']=[{'name':x['name'],'location':x.get('location')} for x in json.loads(so.read_text()) if x['name'].startswith(('project-','global-'))]
  except Exception as e:row['parse_error']=str(e)
 print(json.dumps(row),flush=True)
# App-server is a local JSON-RPC process. initialize and skills/list do not start a thread/turn.
exe=shutil.which('codex')
if exe:
 argv=[exe,'app-server'];se=cache/'codex-rpc.stderr';messages=[];sent=[]
 with se.open('w') as e:
  p=subprocess.Popen(argv,cwd=project,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=e,text=True,bufsize=1)
  def send(v):sent.append(v);p.stdin.write(json.dumps(v)+'\n');p.stdin.flush()
  send({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'clientInfo':{'name':'host-capability-research','version':'1.0'},'capabilities':{'experimentalApi':True}}})
  sel=selectors.DefaultSelector();sel.register(p.stdout,selectors.EVENT_READ);start=time.monotonic();listed=False
  while time.monotonic()-start<20:
   if not sel.select(1):continue
   line=p.stdout.readline()
   if not line:break
   try:v=json.loads(line)
   except ValueError:messages.append({'raw':line});continue
   messages.append(v)
   if v.get('id')==1 and 'result' in v:
    send({'jsonrpc':'2.0','method':'initialized'});send({'jsonrpc':'2.0','id':2,'method':'skills/list','params':{'cwds':[str(project)],'forceReload':True}})
   if v.get('id')==2:listed=True;break
  p.terminate()
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:p.kill();p.wait()
  raw={'sent':sent,'received':messages};(cache/'codex-rpc.json').write_text(json.dumps(raw,indent=2)+'\n');rows.append({'argv':argv,'cwd':str(project),'exit_code_after_terminate':p.returncode,'skills_list_response':listed,'raw_file':str(cache/'codex-rpc.json'),'raw_sha256':hashlib.sha256((cache/'codex-rpc.json').read_bytes()).hexdigest(),'received':messages})
else: rows.append({'host':'codex','available':False,'requested_method':'skills/list'})
after=tree();(cache/'tree-before.json').write_text(json.dumps(before,indent=2)+'\n');(cache/'tree-after.json').write_text(json.dumps(after,indent=2)+'\n')
result={'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'root':str(root),'env':env,'tree_before_sha256':hashlib.sha256((cache/'tree-before.json').read_bytes()).hexdigest(),'tree_after_sha256':hashlib.sha256((cache/'tree-after.json').read_bytes()).hexdigest(),'results':rows}
(cache.parent/'discovery-results.full.json').write_text(json.dumps(result,indent=2)+'\n');print('Discovery evidence:',cache.parent/'discovery-results.full.json',flush=True)
