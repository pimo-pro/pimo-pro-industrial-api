/** Slug de rota: maiúsculas, alfanumérico + underscore. */
export function toRouteSlug(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase() || 'X';
}

/** Caixa "Caixa 1" → C1; já C1 mantém. */
export function boxToSlug(boxName: string, index: number): string {
  const trimmed = String(boxName ?? '').trim();
  const match = trimmed.match(/\b(\d+)\s*$/);
  if (match) return `C${match[1]}`;
  const letterMatch = trimmed.match(/^C(\d+)$/i);
  if (letterMatch) return `C${letterMatch[1]}`;
  return `C${index + 1}`;
}

const TIPO_TO_PREFIX: Record<string, string> = {
  lateral_direita: 'LAT_DIR',
  lateral_esquerda: 'LAT_ESQ',
  gaveta_frente: 'GAV_FRENT',
  gaveta_fundo: 'GAV_FUN',
  cima: 'TOP',
  fundo: 'FND',
  COSTA: 'COS',
  costa: 'COS',
  prateleira: 'PRA',
  porta_simples: 'POR_SIM',
  porta_dupla: 'POR_DUP',
};

export function pieceNameFromItem(item: { nome?: string; tipo?: string; metadata?: Record<string, unknown> }): string {
  const fromMeta = item.metadata?.industrialLabel;
  if (typeof fromMeta === 'string' && fromMeta.trim()) {
    const parts = fromMeta.trim().split('_');
    return parts[parts.length - 1]?.toUpperCase() ?? fromMeta.toUpperCase();
  }
  const tipo = String(item.tipo ?? '').trim();
  if (tipo && TIPO_TO_PREFIX[tipo]) return TIPO_TO_PREFIX[tipo];
  const nome = String(item.nome ?? '').trim();
  if (nome) return toRouteSlug(nome);
  return 'PECA';
}

export function buildPieceRef(
  boxSlug: string,
  item: { nome?: string; tipo?: string; metadata?: Record<string, unknown> }
): string {
  return `${boxSlug}_${pieceNameFromItem(item)}`;
}

export function generateEtiquetaCode(
  projectName: string,
  boxName: string,
  pieceName: string,
  pieceNumber: number
): string {
  const toLow = (s: string) => String(s || '').toLowerCase();
  const projRaw = toLow(projectName || 'projeto').replace(/\s/g, '');
  const boxRaw = toLow(boxName || 'xx');
  const pieceRaw = toLow(pieceName || 'pec').replace(/\s/g, '');

  let projLen = Math.min(5, Math.max(3, projRaw.length));
  let proj = projRaw.slice(0, projLen).padEnd(projLen, projRaw[0] || 'x');
  const box = boxRaw.slice(0, 2).padEnd(2, 'x');
  let pieceLen = 3;
  let piece = pieceRaw.slice(0, pieceLen).padEnd(pieceLen, pieceRaw[0] || 'x');

  const n = Math.max(1, Math.floor(pieceNumber));
  const num = n < 10 ? String(n).padStart(2, '0') : String(n).padStart(3, '0');

  let code = `${proj}${box}${piece}${num}`;

  while (code.length > 14 && pieceLen > 0) {
    pieceLen -= 1;
    piece = pieceRaw.slice(0, pieceLen).padEnd(pieceLen, pieceRaw[0] || 'x');
    code = `${proj}${box}${piece}${num}`;
  }
  while (code.length > 14 && projLen > 3) {
    projLen -= 1;
    proj = projRaw.slice(0, projLen).padEnd(projLen, projRaw[0] || 'x');
    code = `${proj}${box}${piece}${num}`;
  }

  return code.slice(0, 14);
}
