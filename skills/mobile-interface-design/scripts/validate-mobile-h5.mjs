#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const input = process.argv[2]
if (!input) {
  console.error('用法：node validate-mobile-h5.mjs <html-file>')
  process.exit(2)
}

const htmlPath = path.resolve(process.cwd(), input)
if (!fs.existsSync(htmlPath)) {
  console.error(`找不到文件：${htmlPath}`)
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
  pass('已找到 viewport meta 标签。')
} else {
  fail('缺少 viewport meta 标签。')
}

const viewport = html.match(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
if (/width\s*=\s*device-width/i.test(viewport)) pass('viewport 已使用 device-width。')
else warn('viewport 未明确设置 width=device-width。')

if (/viewport-fit\s*=\s*cover/i.test(viewport)) pass('viewport 已启用 safe-area cover。')
else warn('未发现 viewport-fit=cover；全屏 WebView 或刘海屏布局可能需要它。')

if (/\b100dvh\b|\b100svh\b|\b100lvh\b/i.test(styles)) {
  pass('已检测到动态 viewport 单位。')
} else if (/\b100vh\b/i.test(styles)) {
  warn('检测到 100vh，但没有动态 viewport 单位；移动浏览器工具栏可能导致高度问题。')
} else {
  warn('未检测到动态 viewport 单位；如果页面依赖全屏高度，请手动验证。')
}

if (/safe-area-inset-(?:top|bottom|left|right)/i.test(styles)) {
  pass('已检测到 safe-area inset。')
} else {
  warn('未检测到 safe-area inset；仅当布局不贴设备边缘或宿主已处理 safe area 时可接受。')
}

const fixedCanvas = [...styles.matchAll(/(?:width|min-width|max-width)\s*:\s*(3(?:7[5-9]|8\d|9\d|4[0-3]\d))px/gi)]
if (fixedCanvas.length) {
  warn(`检测到手机尺寸的固定宽度（${fixedCanvas[0][0]}）。请确认它没有被用作整个页面画布。`)
} else {
  pass('未发现明显的手机尺寸固定画布宽度。')
}

if (/overflow-x\s*:\s*(?:auto|scroll)/i.test(styles))
  warn('检测到横向滚动；请确认它是有意设计（如 chips/carousel），而不是页面溢出。')

if (/:hover\b/i.test(styles) && !/(?:@media\s*\([^)]*hover\s*:\s*hover|:active|:focus-visible)/i.test(styles))
  warn('检测到 hover 样式，但没有明显的触控或 focus 替代方案。')

if (/position\s*:\s*fixed/i.test(styles))
  warn('检测到 fixed 元素；请确认不会遮挡内容，也不会与移动键盘或 safe area 冲突。')

if (/<input\b/i.test(html) && !/<label\b|aria-label\s*=|aria-labelledby\s*=/i.test(html))
  warn('检测到 input，但没有明显的 label / aria-label。')

if (/prefers-reduced-motion/i.test(styles)) {
  pass('已检测到 reduced-motion 处理。')
} else if (/@keyframes\b|animation\s*:|transition\s*:/i.test(styles)) {
  warn('检测到动效，但没有 prefers-reduced-motion 处理。')
}

if (/<button\b/i.test(html) || /role=["']button["']/i.test(html)) {
  pass('已检测到按钮语义。')
} else {
  warn('未检测到按钮语义；只读页面可以接受，否则请检查交互控件。')
}

// High-confidence generated-UI/default-style heuristics.
// These are warnings only. Intentional designs may legitimately trigger them.
if (/transition\s*:\s*all\b/i.test(styles))
  warn('检测到 transition: all。建议显式指定属性，让动效更可控。')

const hasGradient = /(?:linear|radial|conic)-gradient\s*\(/i.test(styles)
const clipsText = /(?:-webkit-)?background-clip\s*:\s*text/i.test(styles)
const transparentText = /(?:-webkit-)?text-fill-color\s*:\s*transparent|color\s*:\s*transparent/i.test(styles)
if (hasGradient && clipsText && transparentText)
  warn('检测到渐变文字。请确认它来自 Visual Contract，而不是默认强调手法。')

const pillRadii = [...styles.matchAll(/border-radius\s*:\s*(?:999(?:9)?px|999rem|50%)/gi)]
if (pillRadii.length >= 4)
  warn(`pill / circle 圆角出现 ${pillRadii.length} 次。请确认 pill 只用于真正适合这种形状的角色。`)

const largeRadii = [...styles.matchAll(/border-radius\s*:\s*(?:2[0-9]|3[0-9]|4[0-9])px/gi)]
if (largeRadii.length >= 6)
  warn(`20–49px 大圆角出现 ${largeRadii.length} 次。请确认没有把同一个大圆角套在所有 surface 上。`)

const shadowCount = [...styles.matchAll(/\bbox-shadow\s*:/gi)].length
if (shadowCount >= 6)
  warn(`box-shadow 出现 ${shadowCount} 次。请确认深度是统一策略，而不是逐卡片装饰。`)

if (/font-family\s*:[^;]*(?:monospace|ui-monospace)/i.test(styles)) {
  const codeLike = /<(?:code|pre|kbd|samp)\b/i.test(html)
  if (!codeLike)
    warn('检测到 monospace 字体，但没有明显代码内容。请确认它用于数据/测量语义，而不是泛化的“科技感”装饰。')
}

const inlineEmojiIcon = /<(?:button|a|span|div)[^>]*>\s*(?:[\u{1F300}-\u{1FAFF}]|[\u2600-\u27BF])\s*<\/(?:button|a|span|div)>/gu
if (inlineEmojiIcon.test(html))
  warn('检测到 emoji / 符号被直接作为界面元素。生产 UI 优先使用项目图标系统或自定义 SVG。')

const fails = results.filter(r => r.level === 'FAIL').length
const warns = results.filter(r => r.level === 'WARN').length

for (const r of results)
  console.log(`[${r.level}] ${r.msg}`)

console.log(`\n汇总：${fails} 个失败，${warns} 个警告。`)
console.log('设计默认值告警属于启发式检测；如果 Visual Contract 有充分理由，可以保留有意例外。')

process.exit(fails ? 1 : 0)
