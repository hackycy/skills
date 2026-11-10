#!/usr/bin/env python3
"""Inspect three pinned source views. Differences are not classified as bugs."""
import argparse, json, re, subprocess, hashlib
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('checkout',type=Path)
p.add_argument('--output',type=Path,default=Path('provider-views.json'))
a=p.parse_args()
root=a.checkout.resolve()
cmd=['git','-C',str(root),'rev-parse','HEAD']
head=subprocess.run(cmd,text=True,capture_output=True)
assert head.returncode==0 and head.stdout.strip()=='035c8f319edd019936525a062fe99e83ca8d12c6', 'wrong source commit'
paths=['scripts/lib/transformers/providers.js','crates/skills/src/providers.rs','crates/context/src/provider.rs']
sources={p:(root/p).read_text() for p in paths}
js=sources[paths[0]]
keys=re.findall(r"^  (?:'([^']+)'|([a-z][a-z0-9_-]*)): \{",js,re.M)
transformer=[x or y for x,y in keys]
rs=sources[paths[1]]
dirs=re.search(r'pub const PROVIDER_DIRS:.*?= &\[(.*?)\];',rs,re.S).group(1)
installer=re.findall(r'"([^"]+)"',dirs)
context=re.findall(r'"(\.[^"]+)" => "[^"]+"',sources[paths[2]])
report={'kind':'C: fixed-source structural observation; not an installation or host behavior proof','command':cmd,'exit_code':head.returncode,'commit':head.stdout.strip(),'sources':[{'path':p,'sha256':hashlib.sha256(s.encode()).hexdigest()} for p,s in sources.items()],'transformer_keys':transformer,'installer_directories':installer,'context_directories':context,'counts':{'transformers':len(transformer),'installer_dirs':len(installer),'context_dirs':len(context)}}
a.output.parent.mkdir(parents=True,exist_ok=True)
a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
