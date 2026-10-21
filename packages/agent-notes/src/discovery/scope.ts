import type { Scope } from '../notes/model'
import { safePath } from '../notes/snapshot'

export function validPattern(pattern: string): boolean {
  return safePath(pattern) && !/[!{}()[\]]/.test(pattern)
    && pattern.split('/').every(part => !part.includes('**') || part === '**')
}

// v1 deliberately supports only *, ?, and a complete ** path segment.
export function matchesPath(pattern: string, path: string): boolean {
  const parts = pattern.split('/')
  const candidate = path.split('/')
  const memo = new Map<string, boolean>()
  const match = (i: number, j: number): boolean => {
    const key = `${i}:${j}`
    const cached = memo.get(key)
    if (cached !== undefined)
      return cached
    let result: boolean
    if (i === parts.length) {
      result = j === candidate.length
    }
    else if (parts[i] === '**') {
      result = match(i + 1, j) || (j < candidate.length && match(i, j + 1))
    }
    else {
      const segment = parts[i].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
      result = j < candidate.length && new RegExp(`^${segment}$`, 'u').test(candidate[j]) && match(i + 1, j + 1)
    }
    memo.set(key, result)
    return result
  }
  return match(0, 0)
}

export function matchReasons(scope: Scope, paths: string[], topics: string[]): string[] {
  const reasons: string[] = []
  if (scope.global)
    reasons.push('global')
  for (const path of paths) {
    for (const pattern of scope.paths ?? []) {
      if (matchesPath(pattern, path))
        reasons.push(`path:${path} (${pattern})`)
    }
  }
  for (const topic of topics) {
    if (scope.topics?.includes(topic))
      reasons.push(`topic:${topic}`)
  }
  return reasons
}
