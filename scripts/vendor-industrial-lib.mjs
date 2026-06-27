/**
 * Copia módulos MES necessários de pimo-pro-industrial (fecho mínimo de dependências).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
const industrialSrc = path.resolve(apiRoot, '..', 'pimo-pro-industrial', 'src');
const vendorRoot = path.join(apiRoot, 'src', 'vendor');

/** Ficheiros relativos a pimo-pro-industrial/src/ */
const VENDOR_FILES = [
  'types/piece.ts',
  'core/pieceNaming.ts',
  'core/operations.ts',
  'core/pieceState.ts',
  'core/priorityRules.ts',
  'core/trackingLogs.ts',
  'core/sessions.ts',
  'core/pieceIntelligence.ts',
  'core/autoProgress.ts',
  'core/autoStatus.ts',
  'core/autoResolver.ts',
  'core/anomalyDetector.ts',
  'core/alerts.ts',
  'core/intelligencePipeline.ts',
  'core/pieceNormalizer.ts',
  'core/workOrders.ts',
  'core/dashboardAggregator.ts',
  'core/projectManager.ts',
  'industrial/quality/types.ts',
  'industrial/quality/actions.ts',
  'industrial/rework/types.ts',
  'industrial/rework/actions.ts',
  'industrial/supervisor/snapshot.ts',
];

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(rel) {
  const src = path.join(industrialSrc, rel);
  const dest = path.join(vendorRoot, rel);
  if (!fs.existsSync(src)) {
    console.error(`ERRO: ficheiro ausente: ${src}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`vendor: ${rel}`);
}

if (!fs.existsSync(industrialSrc)) {
  if (fs.existsSync(vendorRoot) && fs.readdirSync(vendorRoot).length > 0) {
    console.log('Monorepo ausente — src/vendor/ já presente, skip copy.');
    process.exit(0);
  }
  console.error(`ERRO: origem ausente: ${industrialSrc}`);
  process.exit(1);
}

rmDir(vendorRoot);
for (const rel of VENDOR_FILES) copyFile(rel);
console.log('Vendor industrial concluído.');
