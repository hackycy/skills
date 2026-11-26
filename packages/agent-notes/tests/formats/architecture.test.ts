import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))

function dependencies(entry: string): string[] {
  const scanned = new Set<string>()
  function scan(file: string): void {
    if (scanned.has(file))
      return
    scanned.add(file)
    if (!file.endsWith('.ts'))
      return
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    function follow(specifier: ts.Node): void {
      if (!ts.isStringLiteralLike(specifier))
        throw new Error(`Nonliteral module loading in ${relative(root, file)}`)
      if (!specifier.text.startsWith('.'))
        return
      const target = resolve(dirname(file), specifier.text)
      const resolved = [target, `${target}.ts`, join(target, 'index.ts')].find(path => /\.(?:ts|json)$/.test(path) && existsSync(path))
      if (!resolved)
        throw new Error(`Cannot resolve ${specifier.text} from ${file}`)
      scan(resolved)
    }
    function visit(node: ts.Node): void {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
        follow(node.moduleSpecifier)
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        follow(node.arguments[0])
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  scan(join(root, entry))
  return [...scanned].map(path => relative(root, path))
}

it.each(['src/notes/reader.ts', 'src/notes/history.ts', 'src/workflow/plan.ts'])('keeps %s independent of document adapters and schemas', (entry) => {
  expect(dependencies(entry).filter(path => /formats\/(?:adapters\/|production)|\.schema\.json$/.test(path))).toEqual([])
})

it('makes the production CLI depend on each registered v1 adapter and excludes experimental files', () => {
  const graph = dependencies('src/cli/main.ts')
  expect(graph).toEqual(expect.arrayContaining(['note-v1', 'manifest-v1', 'config-v1'].map(name => `src/notes/formats/adapters/${name}.ts`)))
  expect(graph.filter(path => path.startsWith('tests/'))).toEqual([])
})
