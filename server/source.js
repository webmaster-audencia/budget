/**
 * Résolution + lecture (en streaming) de la source du fichier budgétaire.
 *
 * Performance : on lit le classeur en streaming et on ne matérialise QUE les
 * lignes des onglets utiles (CONSO, BUDGET). Les onglets volumineux inutiles
 * (EXTRACT BASWARE, BDC, …) ne sont jamais désérialisés en objets lignes, ce
 * qui réduit fortement le temps de lecture initial.
 *
 * Ordre de priorité de la source :
 *   1. BUDGET_FILE_URL   → téléchargement direct (lien réellement téléchargeable
 *                          ou Graph API). Jeton optionnel via BUDGET_FILE_TOKEN.
 *   2. BUDGET_FILE_PATH  → chemin local explicite (OneDrive synchronisé).
 *   3. Premier .xlsx de /data (mode démo / fallback).
 *
 * ⚠️ Un lien de partage SharePoint classique n'est PAS téléchargeable sans
 *    authentification. En cas d'échec distant, on bascule proprement sur le
 *    fallback local et on renvoie une erreur explicite.
 *
 * Invalidation de cache via "version" :
 *   - local  : `${mtimeMs}:${size}` (fs.stat)
 *   - distant : ETag / Last-Modified si présents, sinon fenêtre de TTL.
 */
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const REMOTE_TTL_MS = 5 * 60 * 1000;
const TARGET_SHEETS = ['CONSO', 'BUDGET'];

function normalizeName(s) {
  return String(s || '').trim().toLowerCase();
}

/** Onglet bufferisé minimal, compatible avec l'usage fait dans excel.js. */
class BufferedSheet {
  constructor(name) {
    this.name = name;
    this._rows = new Map(); // rowNumber -> values[] (index = n° colonne, 1-based)
    this._maxCol = 0;
  }
  addRow(rowNumber, values) {
    this._rows.set(rowNumber, values);
    if (values.length - 1 > this._maxCol) this._maxCol = values.length - 1;
  }
  get actualColumnCount() { return this._maxCol; }
  get columnCount() { return this._maxCol; }
  getRow(r) {
    const vals = this._rows.get(r) || [];
    return { number: r, getCell: (c) => ({ value: vals[c] ?? null }) };
  }
  eachRow(_opts, cb) {
    const nums = [...this._rows.keys()].sort((a, b) => a - b);
    for (const num of nums) {
      const vals = this._rows.get(num);
      cb({ number: num, getCell: (c) => ({ value: vals[c] ?? null }) }, num);
    }
  }
}

function findLocalDataFile() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const all = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'));
  if (all.length === 0) return null;
  // En présence de plusieurs classeurs, on retient le plus récemment modifié
  // (aucun nom de fichier codé en dur) : déposer une version à jour suffit.
  return all
    .map((f) => {
      const p = path.join(DATA_DIR, f);
      return { p, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0].p;
}

function shorten(u) {
  try { return new URL(u).host; } catch { return 'url'; }
}

function resolveSource() {
  const url = process.env.BUDGET_FILE_URL;
  if (url && url.trim()) return { kind: 'remote', url: url.trim(), label: `SharePoint/URL (${shorten(url)})` };
  const explicit = process.env.BUDGET_FILE_PATH;
  if (explicit && explicit.trim()) return { kind: 'local', path: explicit.trim(), label: 'Local (BUDGET_FILE_PATH)' };
  const found = findLocalDataFile();
  if (found) return { kind: 'local', path: found, label: `Local (/data/${path.basename(found)})` };
  return { kind: 'none' };
}

/**
 * Calcule une "version" SANS lire le contenu (rapide), pour décider d'un cache HIT
 * avant tout parsing Excel coûteux. Local : fs.stat (mtime+taille). Distant :
 * HEAD pour ETag/Last-Modified, sinon fenêtre de TTL. Retourne null si impossible
 * (→ rechargement forcé).
 */
async function probeVersion() {
  const src = resolveSource();
  if (src.kind === 'local' && fs.existsSync(src.path)) {
    const st = fs.statSync(src.path);
    return `${st.mtimeMs}:${st.size}`;
  }
  if (src.kind === 'remote') {
    try {
      const headers = {};
      if (process.env.BUDGET_FILE_TOKEN && process.env.BUDGET_FILE_TOKEN.trim()) {
        headers.Authorization = `Bearer ${process.env.BUDGET_FILE_TOKEN.trim()}`;
      }
      const resp = await fetch(src.url, { method: 'HEAD', headers, redirect: 'follow' });
      const etag = resp.headers.get('etag');
      const lastMod = resp.headers.get('last-modified');
      if (etag || lastMod) return etag || lastMod;
    } catch { /* ignore */ }
    return `ttl:${Math.floor(Date.now() / REMOTE_TTL_MS)}`;
  }
  return null;
}

/** Streame un classeur (path ou stream) et bufferise uniquement les onglets cibles. */
async function streamTargets(input) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(input, {
    worksheets: 'emit',
    sharedStrings: 'cache',
    styles: 'ignore',
    hyperlinks: 'ignore',
    entries: 'emit',
  });
  const wanted = new Set(TARGET_SHEETS.map(normalizeName));
  const sheets = new Map();
  const allSheetNames = [];

  for await (const ws of reader) {
    const name = ws.name || '';
    allSheetNames.push(name);
    if (!wanted.has(normalizeName(name))) continue; // onglet inutile : non désérialisé
    const buf = new BufferedSheet(name);
    for await (const row of ws) {
      const vals = [];
      row.eachCell({ includeEmpty: false }, (cell, col) => { vals[col] = cell.value; });
      buf.addRow(row.number, vals);
    }
    sheets.set(normalizeName(name), buf);
  }

  return {
    getSheet: (n) => sheets.get(normalizeName(n)) || null,
    allSheetNames,
  };
}

/**
 * @returns {Promise<{getSheet:(n:string)=>BufferedSheet|null, allSheetNames:string[], label:string, version:string, fetchMs:number, fileUpdatedAt:string|null}>}
 */
async function loadData() {
  const src = resolveSource();
  const t0 = Date.now();

  if (src.kind === 'none') {
    const err = new Error(
      `Aucune source de fichier budgétaire. Définissez BUDGET_FILE_URL ou BUDGET_FILE_PATH, ` +
        `ou placez un fichier .xlsx dans ${DATA_DIR}.`
    );
    err.code = 'NO_SOURCE';
    throw err;
  }

  if (src.kind === 'local') {
    if (!fs.existsSync(src.path)) {
      const err = new Error(`Fichier budgétaire introuvable : ${src.path}`);
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }
    const st = fs.statSync(src.path);
    const data = await streamTargets(src.path);
    return { ...data, label: src.label, version: `${st.mtimeMs}:${st.size}`, fetchMs: Date.now() - t0, fileUpdatedAt: new Date(st.mtimeMs).toISOString() };
  }

  // remote
  try {
    const headers = {};
    if (process.env.BUDGET_FILE_TOKEN && process.env.BUDGET_FILE_TOKEN.trim()) {
      headers.Authorization = `Bearer ${process.env.BUDGET_FILE_TOKEN.trim()}`;
    }
    const resp = await fetch(src.url, { headers, redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const ctype = resp.headers.get('content-type') || '';
    if (ctype.includes('text/html')) {
      throw new Error('réponse HTML (page de connexion SharePoint probable), pas un fichier Excel téléchargeable.');
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const data = await streamTargets(Readable.from(buf));
    const etag = resp.headers.get('etag');
    const lastMod = resp.headers.get('last-modified');
    const version = etag || lastMod || `ttl:${Math.floor(Date.now() / REMOTE_TTL_MS)}`;
    return { ...data, label: src.label, version, fetchMs: Date.now() - t0, fileUpdatedAt: lastMod ? new Date(lastMod).toISOString() : null };
  } catch (e) {
    const fallback = findLocalDataFile() || (process.env.BUDGET_FILE_PATH || '').trim();
    if (fallback && fs.existsSync(fallback)) {
      const st = fs.statSync(fallback);
      const data = await streamTargets(fallback);
      return {
        ...data,
        label: `Fallback local (${path.basename(fallback)}) — distant indisponible : ${e.message}`,
        version: `${st.mtimeMs}:${st.size}`,
        fetchMs: Date.now() - t0,
        fileUpdatedAt: new Date(st.mtimeMs).toISOString(),
      };
    }
    const err = new Error(
      `Récupération distante impossible (${e.message}) et aucun fallback local. ` +
        `Configurez BUDGET_FILE_PATH vers le fichier synchronisé via OneDrive.`
    );
    err.code = 'REMOTE_AND_FALLBACK_FAILED';
    throw err;
  }
}

module.exports = { resolveSource, probeVersion, loadData, DATA_DIR };
