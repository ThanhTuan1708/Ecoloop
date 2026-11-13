// Lists tr('…') strings in src/ that have no English translation in src/i18n.en.ts.
// Usage: npm run i18n:check
import fs from 'node:fs';
import path from 'node:path';
const src = path.resolve(import.meta.dirname, '../src');
const dict = fs.readFileSync(path.join(src, 'i18n.en.ts'), 'utf8');
const keys = new Set([...dict.matchAll(/^ ("(?:\\.|[^"\\])*"):/gm)].map(m => JSON.parse(m[1])));
const missing = new Map();
for (const file of fs.readdirSync(src).filter(f => /\.(tsx?|mjs)$/.test(f) && f !== 'i18n.en.ts')) {
  const text = fs.readFileSync(path.join(src, file), 'utf8');
  for (const m of text.matchAll(/\btr\((['"])((?:\\.|(?!\1).)*)\1/g)) {
    const key = m[2].replace(/\\(['"\\])/g, '$1');
    if (!keys.has(key)) missing.set(key, file);
  }
}
if (missing.size) {
  console.log(`Missing English for ${missing.size} string(s):`);
  for (const [key, file] of missing) console.log(`  ${file}: ${key}`);
  process.exitCode = 1;
} else console.log(`OK — ${keys.size} translations, every tr() string covered.`);
