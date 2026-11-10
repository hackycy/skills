#!/usr/bin/env python3
"""Validate local relative file links and JSON syntax in this research bundle."""
from pathlib import Path
import json,re,sys
root=Path(__file__).resolve().parent
errors=[]
links=0
for p in sorted(root.rglob('*')):
 if not p.is_file(): continue
 if p.suffix=='.json':
  try: json.loads(p.read_text())
  except Exception as e: errors.append(f'{p}: invalid JSON: {e}')
 if p.suffix!='.md': continue
 text=p.read_text()
 # Ignore fenced examples; this checks actual inline Markdown links.
 text=re.sub(r'(?m)^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$','',text)
 text=re.sub(r'(?m)^L[0-9]+:.*$', '', text)
 targets=re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',text)
 targets+=re.findall(r'(?m)^\[[^\]]+\]:[ \t]+([^ \t\n]+)',text)
 for target in targets:
  target=target.strip().split(' "',1)[0].strip('<>')
  if not target or target.startswith(('#','http://','https://','mailto:','codex://')): continue
  target=target.split('#',1)[0]
  if not target: continue
  links+=1
  if target.startswith('/'):
   errors.append(f'{p.relative_to(root)}: nonportable absolute link {target}')
  elif not (p.parent/target).exists():
   errors.append(f'{p.relative_to(root)}: missing {target}')
result={'kind':'artifact integrity check; does not validate factual claims or heading anchors','relative_file_links':links,'errors':errors}
print(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(bool(errors))
