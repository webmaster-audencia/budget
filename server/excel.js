/**
 * Agrégation budgétaire — modèle de données 2026.
 *
 * SEULS deux onglets sont lus :
 *   - CONSO  : consommé / fléché, ventilés par Partie + Ensemble
 *   - BUDGET : budget dédié par service
 * Tous les autres onglets sont ignorés.
 *
 * Colonnes (résolues par EN-TÊTE, pas par lettre figée, pour rester robuste
 * aux variations de mise en page entre le fichier de démo et le fichier
 * SharePoint cible) :
 *
 *   CONSO  : Service  ← en-tête « Pôle » (ou « Service »)
 *            Partie   ← « Partie »
 *            Ensemble ← « Ensemble »
 *            Consommé ← « CONSOMME »
 *            Fléché   ← « FLECHE »
 *
 *   BUDGET : Service      ← « Pôle » (ou « Service »)
 *            Budget dédié ← en-tête année « B20xx » (sinon « Budget »)
 *
 * Référence demandée (fichier SharePoint cible) : CONSO Q/U/V + N/O,
 * BUDGET J/K. La résolution par en-tête couvre ces lettres comme la
 * disposition réelle du fichier de démo. Les lettres effectivement
 * retenues sont remontées dans les warnings/stats à des fins de contrôle.
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
function extractConso(ws, warnings, stats) {
  const result = { groups: new Map(), byService: new Map() }; // byService: service -> {consomme,fleche}
  if (!ws) {
    warnings.push("Onglet « CONSO » introuvable : aucun consommé ni fléché ne peut être calculé.");
    return result;
  }

  const { cols, letters, headerRow } = resolveColumns(ws, {
    service: (n) => n === 'pole' || n === 'service',
    partie: (n) => n === 'partie',
    ensemble: (n) => n === 'ensemble',
    consomme: (n) => n === 'consomme',
    fleche: (n) => n === 'fleche',
  });
  stats.consoColumns = letters;
  stats.consoHeaderRow = headerRow;

  for (const k of ['service', 'consomme', 'fleche']) {
    if (cols[k] == null) {
      warnings.push(`Onglet CONSO : colonne « ${k} » introuvable (en-tête non détecté). Les valeurs correspondantes seront ignorées.`);
    }
  }
  if (cols.service == null) return result;

  const unknownServices = new Set();
  let parsed = 0;
  let kept = 0;
  let nonNumeric = 0;

  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn <= headerRow) return;
    parsed++;

    const serviceRaw = cols.service ? cellValue(row.getCell(cols.service)) : null;
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

    let consomme = toNumber(cRaw);
    let fleche = toNumber(fRaw);
    if (consomme == null) { if (cRaw != null && String(cRaw).trim() !== '') nonNumeric++; consomme = 0; }
    if (fleche == null) { if (fRaw != null && String(fRaw).trim() !== '') nonNumeric++; fleche = 0; }

    const key = `${service}||${partieStr}||${ensembleStr}`;
    let g = result.groups.get(key);
    if (!g) {
      g = {
        service,
        partie: partieStr,
        ensemble: ensembleStr,
        detailLabel: detailLabel(partieStr, ensembleStr),
        consomme: 0,
        fleche: 0,
        sourceRows: 0,
      };
      result.groups.set(key, g);
    }
    g.consomme += consomme;
    g.fleche += fleche;
    g.sourceRows += 1;

    let svc = result.byService.get(service);
    if (!svc) { svc = { consomme: 0, fleche: 0 }; result.byService.set(service, svc); }
    svc.consomme += consomme;
    svc.fleche += fleche;

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

  stats.consoRowsParsed = parsed;
  stats.consoRowsKept = kept;
  return result;
}

/* ----------------------------- BUDGET ----------------------------- */
function extractBudget(ws, warnings, stats) {
  const byService = new Map(); // service -> budgetDedie
  if (!ws) {
    warnings.push("Onglet « BUDGET » introuvable : le budget dédié sera considéré comme 0 pour tous les services.");
    return byService;
  }

  const { cols, letters, headerRow } = resolveColumns(ws, {
    service: (n) => n === 'pole' || n === 'service',
    budget: (n) => /^b\s?20\d{2}$/.test(n) || n === 'budget' || n === 'budget dedie' || n === 'montant',
  });
  stats.budgetColumns = letters;
  stats.budgetHeaderRow = headerRow;

  if (cols.service == null) {
    warnings.push('Onglet BUDGET : colonne service (« Pôle ») introuvable. Aucun budget dédié ne peut être rattaché.');
    return byService;
  }
  if (cols.budget == null) {
    warnings.push('Onglet BUDGET : colonne budget dédié introuvable (en-tête « B20xx »/« Budget »). Budget considéré comme 0.');
  }

  const unknownServices = new Set();
  let parsed = 0;
  let kept = 0;
  let nonNumeric = 0;

  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn <= headerRow) return;
    parsed++;

    const serviceRaw = cellValue(row.getCell(cols.service));
    if (typeof serviceRaw !== 'string' || serviceRaw.trim() === '') return;
    if (isTotalLabel(serviceRaw)) return;

    const service = matchService(serviceRaw);
    if (!service) { unknownServices.add(serviceRaw.trim()); return; }

    let budget = 0;
    if (cols.budget != null) {
      const bRaw = cellValue(row.getCell(cols.budget));
      const n = toNumber(bRaw);
      if (n == null) { if (bRaw != null && String(bRaw).trim() !== '') nonNumeric++; }
      else budget = n;
    }

    byService.set(service, (byService.get(service) || 0) + budget);
    kept++;
  });

  if (unknownServices.size) {
    warnings.push(
      `Onglet BUDGET : ${unknownServices.size} valeur(s) de service hors liste blanche ignorée(s) — ${[...unknownServices].slice(0, 12).join(', ')}${unknownServices.size > 12 ? '…' : ''}.`
    );
  }
  if (nonNumeric) {
    warnings.push(`Onglet BUDGET : ${nonNumeric} valeur(s) non numérique(s) dans le budget dédié, traitées comme 0.`);
  }

  stats.budgetRowsParsed = parsed;
  stats.budgetRowsKept = kept;
  return byService;
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
  const budgetWs = data.getSheet('BUDGET');

  const conso = extractConso(consoWs, warnings, stats);
  const budgetMap = extractBudget(budgetWs, warnings, stats);

  // Services à afficher : autorisés présents dans CONSO OU BUDGET, ordre de la liste blanche.
  const present = new Set([...conso.byService.keys(), ...budgetMap.keys()]);
  const serviceNames = AUTHORIZED_SERVICES.filter((s) => present.has(s));

  const detailsByService = new Map();
  for (const g of conso.groups.values()) {
    if (!detailsByService.has(g.service)) detailsByService.set(g.service, []);
    detailsByService.get(g.service).push({
      service: g.service,
      partie: g.partie,
      ensemble: g.ensemble,
      detailLabel: g.detailLabel,
      consomme: g.consomme,
      fleche: g.fleche,
      sourceRows: g.sourceRows,
      resteADepenser: null, // non ventilable au niveau ligne
    });
  }
  for (const arr of detailsByService.values()) {
    arr.sort((a, b) => a.detailLabel.localeCompare(b.detailLabel, 'fr', { sensitivity: 'base' }));
  }

  const services = serviceNames.map((name) => {
    const c = conso.byService.get(name) || { consomme: 0, fleche: 0 };
    const budgetDedie = budgetMap.get(name) || 0;
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

  if (services.length === 0) {
    warnings.push('Aucun service autorisé détecté dans les onglets CONSO/BUDGET. Vérifiez la source du fichier et la liste blanche des services.');
  }

  const allSheets = data.allSheetNames || [];
  stats.sheetsUsed = [consoWs && consoWs.name, budgetWs && budgetWs.name].filter(Boolean);
  stats.sheetsIgnored = allSheets.filter((n) => !stats.sheetsUsed.includes(n));
  stats.servicesDetected = services.length;
  stats.authorizedServices = AUTHORIZED_SERVICES;
  stats.aggregationMs = Date.now() - t0;

  return { global, services, warnings, stats };
}

module.exports = { aggregate, AUTHORIZED_SERVICES, normalize, matchService };
