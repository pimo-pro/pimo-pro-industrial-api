/**
 * Publica pimo-pro-industrial-api → github.com/pimo-pro/pimo-pro-industrial-api (Render auto-deploy).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployDir = path.join(apiRoot, '.deploy-api-push');
const remote = 'https://github.com/pimo-pro/pimo-pro-industrial-api.git';

const COPY_ITEMS = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'render.yaml',
  'ecosystem.config.cjs',
  'README.md',
  'scripts',
  'src',
];

const SKIP_UNDER_SRC = new Set(['vendor/.gitkeep']);

function run(cmd, cwd = apiRoot) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === 'node_modules' || name === 'dist') continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

console.log('=== Deploy API → pimo-pro-industrial-api (Render) ===');

run('npm run build');

if (fs.existsSync(deployDir)) fs.rmSync(deployDir, { recursive: true, force: true });
fs.mkdirSync(deployDir, { recursive: true });

run('git clone --depth 1 --branch main ' + remote + ' .', deployDir);

for (const item of COPY_ITEMS) {
  const src = path.join(apiRoot, item);
  if (!fs.existsSync(src)) {
    console.warn(`skip (ausente): ${item}`);
    continue;
  }
  copyRecursive(src, path.join(deployDir, item));
}

run('git add -A', deployDir);
try {
  run('git diff --cached --quiet', deployDir);
  console.log('Nada a publicar — remoto já actualizado.');
} catch {
  run(
    'git commit -m "feat(api): MES publico /api/industrial + SGPI + storage persistente"',
    deployDir
  );
  run('git push origin main', deployDir);
  console.log('Push concluído — Render deve redeploy automaticamente.');
}

fs.rmSync(deployDir, { recursive: true, force: true });
