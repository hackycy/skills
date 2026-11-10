/** The only editable catalog. Build copies this data into source-index.json. */
export const integrations = [
  { id: 'generic', label: 'Generic (.agents)', default: true, skillRoot: '.agents/skills' },
  { id: 'codex', label: 'Codex', default: false, skillRoot: '.agents/skills' },
  { id: 'claude-code', label: 'Claude Code', default: false, skillRoot: '.claude/skills' },
] as const

export function integrationChoices(): readonly { id: string, label: string, default: boolean }[] {
  return integrations.map(({ id, label, default: selected }) => ({ id, label, default: selected }))
}
