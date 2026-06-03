/**
 * Agrégation budgétaire — modèle de données 2026.
 *
 * SEUL l'onglet CONSO est lu pour alimenter le dashboard. Tous les autres
 * onglets sont ignorés (BUDGET inclus : son budget n'est plus utilisé, la
 * source du budget dédié est maintenant la colonne « FORECAST AU 2 JUIN
 * - VIRGINIE » de l'onglet CONSO).
 *
 * Colonnes résolues par EN-TÊTE (pas par lettre figée) pour rester robuste
 * aux variations de mise en page :
 *
 *   CONSO  : Service      ← en-tête « Service » (sinon « Pôle »)
 *            Partie       ← « Partie »
 *            Ensemble     ← « Ensemble »
 *            Consommé     ← « CONSOMME »
 *            Fléché       ← « FLECHE »
 *            Budget dédié ← « FORECAST AU 2 JUIN - VIRGINIE »
 *                           (sinon repli sur la colonne S = index 19 ExcelJS)
 *
 * La colonne « Service » est prioritaire sur « Pôle » : si elle existe, elle
 * est la seule source du service et une ligne sans valeur y est ignorée.
 *
 * Budget dédié au niveau ligne, service et global : tout est sommé depuis
 * cette même colonne. Reste à dépenser = Budget dédié − Consommé − Fléché
 * à chaque niveau (ligne, service, global).
 *
 * Services : liste blanche stricte. Toute valeur hors liste est ignorée.
 */

// Liste blanche stricte des services autorisés (ordre d'affichage).
const AUTHORIZED_SERVICES = [
  'Social Media',
  'Webmarketing',
  'Relations Presse',
  'Audiovisuel',
  'Event',
  'Marketing France',
  'Marketing International',
  'Marketing Entreprise',
  'Com et Marketing transverse',
  'Com institutionnelle',
];

// Variantes connues (normalisées) → nom canonique.
const SERVICE_ALIASES = {
  events: 'Event',
  evenement: 'Event',
  evenementiel: 'Event',
  presse: 'Relations Presse',
  'relations presse': 'Relations Presse',
  'social media': 'Social Media',
  socialmedia: 'Social Media',
  'reseaux sociaux': 'Social Media',
  webmarketing: 'Webmarketing',
  'web marketing': 'Webmarketing',
};

function normalize(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Index normalisé → canonique (liste blanche + alias).
const SERVICE_LOOKUP = (() => {
  const m = new Map();
  for (const name of AUTHORIZED_SERVICES) m.set(normalize(name), name);
  for (const [k, v] of Object.entries(SERVICE_ALIASES)) m.set(normalize(k), v);
  return m;
})();

/** Retourne le service canonique autorisé, ou null si hors liste. */
function matchService(raw) {
  if (typeof raw !== 'string') return null;
  const n = normalize(raw);
  if (!n) return null;
  return SERVICE_LOOKUP.get(n) || null;
}

function isTotalLabel(s) {
  if (typeof s !== 'string') return false;
  const n = normalize(s);
  return (
    n === 'total general' ||
    n === 'grand total' ||
    n === 'total' ||
    n === 'sous-total' ||
    n === 'sous total' ||
    n === 'subtotal' ||
    n.startsWith('total ') ||
    n.endsWith(' total')
  );
}

/** Valeur effective d'une cellule (suit les formules jusqu'au résultat). */
function cellValue(cell) {
  const v = cell ? cell.value : null;
  if (v == null) return null;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return v.result ?? null;
    if ('text' in v) return v.text;
    if (v instanceof Date) return v;
  }
  return v;
}

/** Conversion numérique tolérante. Renvoie null si non convertible. */
function toNumber(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[\s €]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    if (cleaned === '' || cleaned === '-') return 0;
    const n = Number(cleaned);
    if (isFinite(n)) return n;
  }
  return null;
}

const COL_LETTERS = (() => {
  const out = [];
  for (let i = 1; i <= 60; i++) {
    let n = i;
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    out[i] = s;
  }
  return out;
})();

/**
 * Localise les colonnes d'un onglet par correspondance d'en-tête.
 * @param {ExcelJS.Worksheet} ws
 * @param {Object.<string, (norm:string, raw:string)=>boolean>} matchers
 * @param {number} maxRows nombre de lignes d'en-tête à scanner
 * @returns {{ cols: Object.<string, number>, letters: Object.<string,string>, headerRow: number }}
 */
function resolveColumns(ws, matchers, maxRows = 6) {
  const keys = Object.keys(matchers);
  const cols = {};
  const headerRows = {};
  const lastCol = Math.max(ws.actualColumnCount || 0, ws.columnCount || 0, 1);

  for (let r = 1; r <= maxRows; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      const raw = cellValue(row.getCell(c));
      if (raw == null || typeof raw === 'object') continue;
      const norm = normalize(raw);
      if (!norm) continue;
      for (const key of keys) {
        if (cols[key] != null) continue;
        if (matchers[key](norm, String(raw))) {
          cols[key] = c;
          headerRows[key] = r;
        }
      }
    }
  }

  const letters = {};
  for (const k of keys) letters[k] = cols[k] != null ? COL_LETTERS[cols[k]] : null;
  const headerRow = Object.values(headerRows).length
    ? Math.max(...Object.values(headerRows))
    : 1;
  return { cols, letters, headerRow };
}

function emptyTotals() {
  return { budgetDedie: 0, consomme: 0, fleche: 0 };
}

function detailLabel(partie, ensemble) {
  const p = (partie || '').trim();
  const e = (ensemble || '').trim();
  if (p && e) return `${p} — ${e}`;
  if (p) return p;
  if (e) return e;
  return 'Non renseigné';
}

/* ----------------------------- CONSO ----------------------------- */
// Colonne S = 19 en index ExcelJS (1-based, A=1). Equivaut à index 18 en 0-based.
const FALLBACK_FORECAST_COL = 19;
const FORECAST_HEADER_NORMALIZED = normalize('FORECAST AU 2 JUIN - VIRGINIE');

function extractConso(ws, warnings, stats) {
  const result = {
    groups: new Map(),       // key → { service, partie, ensemble, detailLabel, budgetDedie, consomme, fleche, sourceRows }
    byService: new Map(),    // service → { budgetDedie, consomme, fleche }
    sampleRows: [],          // quelques lignes pour debug
  };
  if (!ws) {
    warnings.push("Onglet « CONSO » introuvable : aucun consommé ni fléché ne peut être calculé.");
    return result;
  }

  const { cols, letters, headerRow } = resolveColumns(ws, {
    serviceSvc:  (n) => n === 'service',
    servicePole: (n) => n === 'pole',
    partie:   (n) => n === 'partie',
    ensemble: (n) => n === 'ensemble',
    consomme: (n) => n === 'consomme',
    fleche:   (n) => n === 'fleche',
    forecast: (n) => n === FORECAST_HEADER_NORMALIZED,
  });

  // Service : « Service » prioritaire, « Pôle » à défaut.
  const serviceCol = cols.serviceSvc ?? cols.servicePole ?? null;

  // Budget dédié : en-tête « FORECAST AU 2 JUIN - VIRGINIE » prioritaire,
  // sinon repli sur colonne S (= 19 en 1-based ExcelJS).
  const forecastByHeader = cols.forecast != null;
  const forecastCol = forecastByHeader ? cols.forecast : FALLBACK_FORECAST_COL;
  const forecastSource = forecastByHeader ? 'header' : 'fallbackS';
  const forecastLetter = letters.forecast ?? COL_LETTERS[FALLBACK_FORECAST_COL];

  stats.consoColumns = {
    service:  letters.serviceSvc ?? letters.servicePole ?? null,
    partie: letters.partie,
    ensemble: letters.ensemble,
    consomme: letters.consomme,
    fleche: letters.fleche,
    budgetDedie: forecastLetter,
    budgetDedieSource: forecastSource,
  };
  stats.consoHeaderRow = headerRow;

  if (!forecastByHeader) {
    warnings.push(
      `Onglet CONSO : en-tête « FORECAST AU 2 JUIN - VIRGINIE » introuvable. Repli sur la colonne S (${forecastLetter}, index ${FALLBACK_FORECAST_COL}) pour le budget dédié.`
    );
  }
  if (serviceCol == null) {
    warnings.push('Onglet CONSO : colonne service (« Service » ou « Pôle ») introuvable. Les valeurs seront ignorées.');
    return result;
  }
  for (const k of ['consomme', 'fleche']) {
    if (cols[k] == null) {
      warnings.push(`Onglet CONSO : colonne « ${k} » introuvable (en-tête non détecté). Les valeurs correspondantes seront ignorées.`);
    }
  }

  const unknownServices = new Set();
  let parsed = 0;
  let kept = 0;
  let nonNumeric = 0;
  let nonNumericBudget = 0;
  let budgetSeen = 0;

  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn <= headerRow) return;
    parsed++;

    const serviceRaw = cellValue(row.getCell(serviceCol));
    if (typeof serviceRaw !== 'string' || serviceRaw.trim() === '') return;
    if (isTotalLabel(serviceRaw)) return;

    const service = matchService(serviceRaw);
    if (!service) {
      unknownServices.add(serviceRaw.trim());
      return;
    }

    const partie = cols.partie ? cellValue(row.getCell(cols.partie)) : '';
    const ensemble = cols.ensemble ? cellValue(row.getCell(cols.ensemble)) : '';
    const partieStr = typeof partie === 'string' ? partie.trim() : '';
    const ensembleStr = typeof ensemble === 'string' ? ensemble.trim() : '';

    const cRaw = cols.consomme ? cellValue(row.getCell(cols.consomme)) : null;
    const fRaw = cols.fleche ? cellValue(row.getCell(cols.fleche)) : null;
    const bRaw = cellValue(row.getCell(forecastCol));

    let consomme = toNumber(cRaw);
    let fleche = toNumber(fRaw);
    let budgetDedie = toNumber(bRaw);
    if (consomme == null) { if (cRaw != null && String(cRaw).trim() !== '') nonNumeric++; consomme = 0; }
    if (fleche == null) { if (fRaw != null && String(fRaw).trim() !== '') nonNumeric++; fleche = 0; }
    if (budgetDedie == null) {
      if (bRaw != null && String(bRaw).trim() !== '') nonNumericBudget++;
      budgetDedie = 0;
    } else if (budgetDedie !== 0) {
      budgetSeen++;
    }

    const key = `${service}||${partieStr}||${ensembleStr}`;
    let g = result.groups.get(key);
    if (!g) {
      g = {
        service,
        partie: partieStr,
        ensemble: ensembleStr,
        detailLabel: detailLabel(partieStr, ensembleStr),
        budgetDedie: 0,
        consomme: 0,
        fleche: 0,
        sourceRows: 0,
      };
      result.groups.set(key, g);
    }
    g.budgetDedie += budgetDedie;
    g.consomme += consomme;
    g.fleche += fleche;
    g.sourceRows += 1;

    let svc = result.byService.get(service);
    if (!svc) { svc = { budgetDedie: 0, consomme: 0, fleche: 0 }; result.byService.set(service, svc); }
    svc.budgetDedie += budgetDedie;
    svc.consomme += consomme;
    svc.fleche += fleche;

    if (result.sampleRows.length < 5 && budgetDedie !== 0) {
      result.sampleRows.push({
        row: rn, service, partie: partieStr, ensemble: ensembleStr,
        budgetDedie, consomme, fleche,
        reste: budgetDedie - consomme - fleche,
      });
    }

    kept++;
  });

  if (unknownServices.size) {
    warnings.push(
      `Onglet CONSO : ${unknownServices.size} valeur(s) de service hors liste blanche ignorée(s) — ${[...unknownServices].slice(0, 12).join(', ')}${unknownServices.size > 12 ? '…' : ''}.`
    );
  }
  if (nonNumeric) {
    warnings.push(`Onglet CONSO : ${nonNumeric} valeur(s) non numérique(s) dans Consommé/Fléché, traitées comme 0.`);
  }
  if (nonNumericBudget) {
    warnings.push(`Onglet CONSO : ${nonNumericBudget} valeur(s) non numérique(s) dans le budget dédié (colonne ${forecastLetter}), traitées comme 0.`);
  }
  if (kept > 0 && budgetSeen === 0) {
    warnings.push(`Onglet CONSO : aucune valeur numérique de budget dédié trouvée dans la colonne ${forecastLetter} (${forecastSource === 'header' ? 'en-tête FORECAST AU 2 JUIN - VIRGINIE' : 'repli colonne S'}). Le budget dédié sera 0 partout.`);
  }

  stats.consoRowsParsed = parsed;
  stats.consoRowsKept = kept;
  stats.budgetDedieRowsWithValue = budgetSeen;
  return result;
}

/* ----------------------------- Agrégation ----------------------------- */
/**
 * @param {{getSheet:(n:string)=>any, allSheetNames:string[]}} data
 */
function aggregate(data) {
  const warnings = [];
  const stats = {};
  const t0 = Date.now();

  const consoWs = data.getSheet('CONSO');
  const conso = extractConso(consoWs, warnings, stats);

  // Services présents dans CONSO, dans l'ordre de la liste blanche.
  const present = new Set(conso.byService.keys());
  const serviceNames = AUTHORIZED_SERVICES.filter((s) => present.has(s));

  // Lignes de détail = groupes Service + Partie + Ensemble, avec sommes
  // ligne à ligne du Budget dédié, Consommé et Fléché.
  const detailsByService = new Map();
  for (const g of conso.groups.values()) {
    if (!detailsByService.has(g.service)) detailsByService.set(g.service, []);
    detailsByService.get(g.service).push({
      service: g.service,
      partie: g.partie,
      ensemble: g.ensemble,
      detailLabel: g.detailLabel,
      budgetDedie: g.budgetDedie,
      consomme: g.consomme,
      fleche: g.fleche,
      sourceRows: g.sourceRows,
      resteADepenser: g.budgetDedie - g.consomme - g.fleche,
    });
  }
  for (const arr of detailsByService.values()) {
    arr.sort((a, b) => a.detailLabel.localeCompare(b.detailLabel, 'fr', { sensitivity: 'base' }));
  }

  const services = serviceNames.map((name) => {
    const c = conso.byService.get(name) || { budgetDedie: 0, consomme: 0, fleche: 0 };
    const budgetDedie = c.budgetDedie;
    const consomme = c.consomme;
    const fleche = c.fleche;
    const resteADepenser = budgetDedie - consomme - fleche;
    const avancement = budgetDedie > 0 ? (consomme + fleche) / budgetDedie : null;

    if (budgetDedie === 0 && (consomme > 0 || fleche > 0)) {
      warnings.push(`Service « ${name} » : consommé/fléché présent sans budget dédié — avancement non calculable.`);
    }
    if (budgetDedie > 0 && consomme === 0 && fleche === 0) {
      warnings.push(`Service « ${name} » : budget dédié sans aucun consommé ni fléché.`);
    }

    return {
      service: name,
      budgetDedie,
      consomme,
      fleche,
      resteADepenser,
      avancement,
      isOverBudget: resteADepenser < 0,
      lignesDetail: detailsByService.get(name) || [],
    };
  });

  const global = services.reduce(
    (acc, s) => {
      acc.budgetDedie += s.budgetDedie;
      acc.consomme += s.consomme;
      acc.fleche += s.fleche;
      return acc;
    },
    emptyTotals()
  );
  global.resteADepenser = global.budgetDedie - global.consomme - global.fleche;
  global.avancement = global.budgetDedie > 0 ? (global.consomme + global.fleche) / global.budgetDedie : null;
  global.isOverBudget = global.resteADepenser < 0;
  // Alias explicites pour les totaux (compat. avec la spec d'API).
  global.totalBudgetDedie = global.budgetDedie;
  global.totalConsomme = global.consomme;
  global.totalFleche = global.fleche;
  global.totalResteADepenser = global.resteADepenser;

  if (services.length === 0) {
    warnings.push('Aucun service autorisé détecté dans l\'onglet CONSO. Vérifiez la source du fichier et la liste blanche des services.');
  }

  const allSheets = data.allSheetNames || [];
  stats.sheetsUsed = [consoWs && consoWs.name].filter(Boolean);
  stats.sheetsIgnored = allSheets.filter((n) => !stats.sheetsUsed.includes(n));
  stats.servicesDetected = services.length;
  stats.authorizedServices = AUTHORIZED_SERVICES;
  stats.budgetDedieSampleRows = conso.sampleRows;
  stats.aggregationMs = Date.now() - t0;

  return { global, services, warnings, stats };
}

module.exports = { aggregate, AUTHORIZED_SERVICES, normalize, matchService };
