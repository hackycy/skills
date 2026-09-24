#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const input = process.argv[2]
if (!input) {
  console.error('Usage: node validate-mobile-h5.mjs <html-file>')
  process.exit(2)
}

const htmlPath = path.resolve(process.cwd(), input)
if (!fs.existsSync(htmlPath)) {
  console.error(`File not found: ${htmlPath}`)
  process.exit(2)
}

const html = fs.readFileSync(htmlPath, 'utf8')
const dir = path.dirname(htmlPath)

const results = []
const fail = msg => results.push({ level: 'FAIL', msg })
const warn = msg => results.push({ level: 'WARN', msg })
const pass = msg => results.push({ level: 'PASS', msg })

// Keep design-default detectors scoped to actual styling carriers.
// Raw visible prose should not trip CSS heuristics.
const styleChunks = []

for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
  styleChunks.push(match[1])

for (const match of html.matchAll(/\sstyle=["']([^"']*)["']/gi))
  styleChunks.push(match[1])

const localRefs = [...html.matchAll(/<(?:link[^>]+href|script[^>]+src)=["']([^"']+)["'][^>]*>/gi)]
  .map(m => m[1])
  .filter(ref => !/^(?:https?:|data:|\/\/)/i.test(ref))

let linkedSource = ''
for (const ref of localRefs) {
  const clean = ref.split(/[?#]/)[0]
  const p = path.resolve(dir, clean)
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue

  const source = fs.readFileSync(p, 'utf8')
  linkedSource += '\n' + source

  if (/\.css$/i.test(clean))
    styleChunks.push(source)
}

const styles = styleChunks.join('\n')
const combined = html + linkedSource

if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(html)) {
  pass('Viewport meta tag found.')
} else {
  fail('Missing viewport meta tag.')
}

const viewport = html.match(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
if (/width\s*=\s*device-width/i.test(viewport)) pass('Viewport uses device width.')
else warn('Viewport meta does not clearly set width=device-width.')

if (/viewport-fit\s*=\s*cover/i.test(viewport)) pass('Viewport supports safe-area cover.')
else warn('viewport-fit=cover not found; edge-to-edge WebView/notch layouts may need it.')

if (/\b100dvh\b|\b100svh\b|\b100lvh\b/i.test(styles)) {
  pass('Dynamic viewport unit detected.')
} else if (/\b100vh\b/i.test(styles)) {
  warn('100vh detected without a dynamic viewport unit; mobile browser chrome may cause height issues.')
} else {
  warn('No dynamic viewport unit detected; verify full-height layouts manually if applicable.')
}

if (/safe-area-inset-(?:top|bottom|left|right)/i.test(styles)) {
  pass('Safe-area inset usage detected.')
} else {
  warn('No safe-area inset usage detected; acceptable only if the layout does not touch device edges or the host handles it.')
}

const fixedCanvas = [...styles.matchAll(/(?:width|min-width|max-width)\s*:\s*(3(?:7[5-9]|8\d|9\d|4[0-3]\d))px/gi)]
if (fixedCanvas.length) {
  warn(`Phone-sized fixed width detected (${fixedCanvas[0][0]}). Verify this is not being used as the page canvas.`)
} else {
  pass('No obvious phone-sized fixed canvas width detected.')
}

if (/overflow-x\s*:\s*(?:auto|scroll)/i.test(styles))
  warn('Horizontal scrolling is enabled somewhere; verify it is intentional (e.g. chips/carousel) and not page overflow.')

if (/:hover\b/i.test(styles) && !/(?:@media\s*\([^)]*hover\s*:\s*hover|:active|:focus-visible)/i.test(styles))
  warn('Hover styles found without obvious touch/focus alternatives.')

if (/position\s*:\s*fixed/i.test(styles))
  warn('Fixed-position elements detected; verify they do not cover content or conflict with the mobile keyboard/safe area.')

if (/<input\b/i.test(html) && !/<label\b|aria-label\s*=|aria-labelledby\s*=/i.test(html))
  warn('Inputs detected without an obvious label/aria-label.')

if (/prefers-reduced-motion/i.test(styles)) {
  pass('Reduced-motion handling detected.')
} else if (/@keyframes\b|animation\s*:|transition\s*:/i.test(styles)) {
  warn('Motion detected without prefers-reduced-motion handling.')
}

if (/<button\b/i.test(html) || /role=["']button["']/i.test(html)) {
  pass('Interactive button semantics detected.')
} else {
  warn('No button semantics detected; acceptable for read-only pages, otherwise verify controls.')
}

// High-confidence generated-UI/default-style heuristics.
// These are warnings only. Intentional designs may legitimately trigger them.
if (/transition\s*:\s*all\b/i.test(styles))
  warn('transition: all detected. Prefer explicit properties so motion remains intentional and predictable.')

const hasGradient = /(?:linear|radial|conic)-gradient\s*\(/i.test(styles)
const clipsText = /(?:-webkit-)?background-clip\s*:\s*text/i.test(styles)
const transparentText = /(?:-webkit-)?text-fill-color\s*:\s*transparent|color\s*:\s*transparent/i.test(styles)
if (hasGradient && clipsText && transparentText)
  warn('Gradient-text construction detected. Verify it is earned by the Visual Contract rather than used as default emphasis.')

const pillRadii = [...styles.matchAll(/border-radius\s*:\s*(?:999(?:9)?px|999rem|50%)/gi)]
if (pillRadii.length >= 4)
  warn(`Pill/circle radius appears ${pillRadii.length} times. Verify pills are reserved for roles that benefit from pill geometry.`)

const largeRadii = [...styles.matchAll(/border-radius\s*:\s*(?:2[0-9]|3[0-9]|4[0-9])px/gi)]
if (largeRadii.length >= 6)
  warn(`Large 20-49px radii appear ${largeRadii.length} times. Verify one oversized radius is not being applied to every surface.`)

const shadowCount = [...styles.matchAll(/\bbox-shadow\s*:/gi)].length
if (shadowCount >= 6)
  warn(`box-shadow appears ${shadowCount} times. Verify depth is a coherent strategy rather than card-by-card decoration.`)

if (/font-family\s*:[^;]*(?:monospace|ui-monospace)/i.test(styles)) {
  const codeLike = /<(?:code|pre|kbd|samp)\b/i.test(html)
  if (!codeLike)
    warn('Monospace font usage detected without obvious code content. Verify it represents data/measurement rather than a generic "technical" costume.')
}

const inlineEmojiIcon = /<(?:button|a|span|div)[^>]*>\s*(?:[\u{1F300}-\u{1FAFF}]|[\u2600-\u27BF])\s*<\/(?:button|a|span|div)>/gu
if (inlineEmojiIcon.test(html))
  warn('Standalone emoji/symbol used as an interface element. Prefer the project icon system or authored SVG for production UI.')

const fails = results.filter(r => r.level === 'FAIL').length
const warns = results.filter(r => r.level === 'WARN').length

for (const r of results)
  console.log(`[${r.level}] ${r.msg}`)

console.log(`\nSummary: ${fails} failure(s), ${warns} warning(s).`)
console.log('Design-default warnings are heuristics; the committed Visual Contract may justify an intentional exception.')

process.exit(fails ? 1 : 0)
