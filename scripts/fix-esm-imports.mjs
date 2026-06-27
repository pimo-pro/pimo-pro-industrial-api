/**
 * Corrige imports relativos em dist/vendor/ para ESM Node (exige extensão .js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distVendor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/vendor');

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.js')) fixFile(full);
  }
}

function fixFile(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  const fixed = src.replace(
    /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,
    (match, pre, spec, post) => {
      if (spec.endsWith('.js') || spec.endsWith('.json')) return match;
      return `${pre}${spec}.js${post}`;
    }
  );
  if (fixed !== src) fs.writeFileSync(filePath, fixed, 'utf8');
}

walk(distVendor);
console.log('fix-esm-imports: dist/vendor/ actualizado');
