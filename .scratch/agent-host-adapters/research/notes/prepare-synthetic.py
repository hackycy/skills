#!/usr/bin/env python3
"""Apply a deliberately fake third target to the fixed research worktree only."""
from pathlib import Path
import subprocess
root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
assert subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip().startswith('research/host-adapters-')
changes = {
 'src/distribution/manifest.ts': [("'agents' | 'claude'", "'agents' | 'claude' | 'study'"), ("...(targets.includes('agents')", "...(targets.includes('study') ? ['NOTES-STUDY.md'] : []), ...(targets.includes('agents')"), ("['agents', 'claude'].includes(target)", "['agents', 'claude', 'study'].includes(target)")],
 'src/cli/arguments.ts': [("z.enum(['agents', 'claude'])", "z.enum(['agents', 'claude', 'study'])"), ('agents and/or claude.', 'agents, claude and/or study.'), ('<agents|claude>', '<agents|claude|study>'), ('repeat for both', 'repeat for multiple')],
 'src/cli/init.ts': [("{ value: 'claude', label: 'Claude (.claude)' }", "{ value: 'claude', label: 'Claude (.claude)' }, { value: 'study', label: 'Study (.study; synthetic)' }"), ('--target agents and/or --target claude', '--target agents, --target claude and/or --target study')],
 'src/distribution/manage.ts': [("const roots = ['.agents/skills'", "const roots = ['.study/skills', 'NOTES-STUDY.md', '.agents/skills'"), ("(target === 'agents' ? asset.path === 'AGENTS.md' :", "(target === 'study' ? asset.path === 'NOTES-STUDY.md' : target === 'agents' ? asset.path === 'AGENTS.md' :"), ("(target === 'agents' ? 'AGENTS.md' :", "(target === 'study' ? 'NOTES-STUDY.md' : target === 'agents' ? 'AGENTS.md' :")],
 'src/distribution/git-rules.ts': [('(?:agents|claude)', '(?:agents|claude|study)')],
 'src/distribution/layout.ts': [("['AGENTS.md', 'CLAUDE.md'", "['NOTES-STUDY.md', 'AGENTS.md', 'CLAUDE.md'")],
 'src/workflow/transaction.ts': [("layout.configPath, 'AGENTS.md'", "layout.configPath, 'NOTES-STUDY.md', 'AGENTS.md'"), (r'(?:\.agents|\.claude)', r'(?:\.agents|\.claude|\.study)')],
}
base = root / 'packages/agent-notes'
for filename, replacements in changes.items():
 p = base / filename
 text = p.read_text()
 for before, after in replacements:
  assert before in text, (filename, before)
  text = text.replace(before, after)
 p.write_text(text)
print('Synthetic code files:', len(changes))
