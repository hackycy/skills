#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node validate-mobile-h5.mjs <html-file>');
  process.exit(2);
}

const htmlPath = path.resolve(process.cwd(), input);
if (!fs.existsSync(htmlPath)) {
  console.error(`File not found: ${htmlPath}`);
  process.exit(2);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const dir = path.dirname(htmlPath);
let combined = html;

// Pull in local linked styles/scripts when possible. This is intentionally simple and offline.
const refs = [...html.matchAll(/<(?:link[^>]+href|script[^>]+src)=["']([^"']+)["'][^>]*>/gi)]
  .map(m => m[1])
  .filter(ref => !/^(?:https?:|data:|\/\/)/i.test(ref));

for (const ref of refs) {
  const clean = ref.split(/[?#]/)[0];
  const p = path.resolve(dir, clean);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    combined += '\n' + fs.readFileSync(p, 'utf8');
  }
}

const results = [];
const fail = (msg) => results.push({ level: 'FAIL', msg });
const warn = (msg) => results.push({ level: 'WARN', msg });
const pass = (msg) => results.push({ level: 'PASS', msg });

if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(html)) {
  pass('Viewport meta tag found.');
} else {
  fail('Missing viewport meta tag.');
}

const viewport = html.match(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
if (/width\s*=\s*device-width/i.test(viewport)) pass('Viewport uses device width.');
else warn('Viewport meta does not clearly set width=device-width.');

if (/viewport-fit\s*=\s*cover/i.test(viewport)) pass('Viewport supports safe-area cover.');
else warn('viewport-fit=cover not found; edge-to-edge WebView/notch layouts may need it.');

if (/\b100dvh\b|\b100svh\b|\b100lvh\b/i.test(combined)) {
  pass('Dynamic viewport unit detected.');
} else if (/\b100vh\b/i.test(combined)) {
  warn('100vh detected without a dynamic viewport unit; mobile browser chrome may cause height issues.');
} else {
  warn('No dynamic viewport unit detected; verify full-height layouts manually if applicable.');
}

if (/safe-area-inset-(?:top|bottom|left|right)/i.test(combined)) {
  pass('Safe-area inset usage detected.');
} else {
  warn('No safe-area inset usage detected; acceptable only if the layout does not touch device edges or the host handles it.');
}

const fixedCanvas = [...combined.matchAll(/(?:width|min-width|max-width)\s*:\s*(3(?:7[5-9]|8\d|9\d|4[0-3]\d))px/gi)];
if (fixedCanvas.length) {
  warn(`Phone-sized fixed width detected (${fixedCanvas[0][0]}). Verify this is not being used as the page canvas.`);
} else {
  pass('No obvious phone-sized fixed canvas width detected.');
}

if (/overflow-x\s*:\s*(?:auto|scroll)/i.test(combined)) {
  warn('Horizontal scrolling is enabled somewhere; verify it is intentional (e.g. chips/carousel) and not page overflow.');
}

if (/:hover\b/i.test(combined) && !/(?:@media\s*\([^)]*hover\s*:\s*hover|:active|:focus-visible)/i.test(combined)) {
  warn('Hover styles found without obvious touch/focus alternatives.');
}

if (/position\s*:\s*fixed/i.test(combined)) {
  warn('Fixed-position elements detected; verify they do not cover content or conflict with the mobile keyboard/safe area.');
}

if (/<input\b/i.test(html) && !/<label\b|aria-label\s*=|aria-labelledby\s*=/i.test(html)) {
  warn('Inputs detected without an obvious label/aria-label.');
}

if (/prefers-reduced-motion/i.test(combined)) {
  pass('Reduced-motion handling detected.');
} else if (/@keyframes\b|animation\s*:|transition\s*:/i.test(combined)) {
  warn('Motion detected without prefers-reduced-motion handling.');
}

if (/<button\b/i.test(html) || /role=["']button["']/i.test(html)) {
  pass('Interactive button semantics detected.');
} else {
  warn('No button semantics detected; acceptable for read-only pages, otherwise verify controls.');
}

const fails = results.filter(r => r.level === 'FAIL').length;
const warns = results.filter(r => r.level === 'WARN').length;
for (const r of results) console.log(`[${r.level}] ${r.msg}`);
console.log(`\nSummary: ${fails} failure(s), ${warns} warning(s).`);
process.exit(fails ? 1 : 0);
