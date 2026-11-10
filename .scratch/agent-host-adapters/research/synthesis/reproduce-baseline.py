#!/usr/bin/env python3
"""Verify the Notes tarball source assets at the study fixed commit."""
import argparse, hashlib, json, subprocess, tarfile
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('checkout',type=Path)
p.add_argument('tarball',type=Path)
p.add_argument('--output',type=Path,default=Path('artifact-source-comparison.json'))
a=p.parse_args()
root=a.checkout.resolve()
head=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
assert head=='f74deccc5991e0452b3cb83feba51fe1c6bb1c1c', 'wrong baseline'
r={'source_commit':head,'artifact_sha256':hashlib.sha256(a.tarball.read_bytes()).hexdigest(),'asset_comparisons':[]}
with tarfile.open(a.tarball) as tf:
 for m in tf.getmembers():
  if not m.isfile() or not m.name.startswith('package/assets/'): continue
  local=m.name.removeprefix('package/')
  s=(root/'packages/agent-notes'/local).read_bytes()
  t=tf.extractfile(m).read()
  r['asset_comparisons'].append({'path':local,'source_sha256':hashlib.sha256(s).hexdigest(),'tar_sha256':hashlib.sha256(t).hexdigest(),'equal':s==t})
 r['manifest']=json.load(tf.extractfile('package/package.json'))
r['all_assets_equal']=all(x['equal'] for x in r['asset_comparisons'])
a.output.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'assets':len(r['asset_comparisons']),'all_assets_equal':r['all_assets_equal'],'tar_version':r['manifest']['version']}))
assert r['all_assets_equal']
