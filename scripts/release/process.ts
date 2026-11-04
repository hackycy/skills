import { spawn } from 'node:child_process'
import process from 'node:process'

export async function command(cwd: string, file: string, args: string[], live = false, env: NodeJS.ProcessEnv = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env: { ...process.env, ...env }, stdio: live ? 'inherit' : ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errors = ''
    child.stdout?.on('data', chunk => output += chunk.toString())
    child.stderr?.on('data', chunk => errors += chunk.toString())
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0)
        resolve(output.trimEnd())
      else
        reject(new Error(`${file} ${args.join(' ')} 失败（${code}）${live ? '' : `\n${errors || output}`}`))
    })
  })
}

export function git(root: string, ...args: string[]): Promise<string> {
  return command(root, 'git', args, false, { GIT_OPTIONAL_LOCKS: '0' })
}

export async function existsRef(root: string, ref: string): Promise<string | undefined> {
  try {
    return await git(root, 'rev-parse', '--verify', `${ref}^{commit}`)
  }
  catch {
    return undefined
  }
}

export async function ancestor(root: string, older: string, newer: string): Promise<boolean> {
  try {
    await git(root, 'merge-base', '--is-ancestor', older, newer)
    return true
  }
  catch {
    return false
  }
}
