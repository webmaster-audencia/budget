/**
 * Lecture & agrégation du fichier Excel budgétaire.
 *
 * Stratégie de sélection des onglets :
 *   Seuls les onglets contenant l'en-tête "Forecast (Calculé)" en colonne K
 *   (dans les 15 premières lignes) sont traités comme onglets budget.
 *   Les autres onglets (BDC, CONSO, BUDGET, EXTRACT BASWARE, etc.) sont ignorés.
 *
 * Stratégie de sélection des lignes (dans les onglets budget) :
 *   - Colonne A : chaîne non vide, non-formule, non "Total/Grand Total/..."
 *   - Pas de ligne d'en-tête (A = "Service", "Pôle", "Étiquettes de lignes"…)
 *   - Au moins un montant avec valeur absolue > 0 parmi K, L, M
 *   - outlineLevel ≤ 1 (les sous-lignes outlineLevel ≥ 2 sont rejetées)
 *
 * Stratégie outlineLevel :
 *   Si aucune ligne utile n'a outlineLevel === 1, un avertissement est retourné
 *   et on accepte outlineLevel === 0 (stratégie de secours documentée).
 *
 * Colonnes :
 *   K = Forecast (Calculé) = budgetInitial
 *   L = CONSOMME           = budgetConsomme
 *   M = FLECHE             = budgetFleche
 *
 * Les services sont découverts dynamiquement depuis la colonne A.
 * Aucune liste fixe de services n'est utilisée.
 */

const ExcelJS = require('exceljs');

// Mots-clés en colonne A qui indiquent une ligne d'en-tête ou de total à exclure.
const HEADER_LABELS = new Set([
  'service', 'pole', 'etiquettes de lignes', 'cle rappro',
  'axe', 'rubrique', 'libelle', 'designation',
]);

function normalize(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isTotalLabel(s) {
  if (typeof s !== 'string') return false;
  const n = normalize(s);
  return (
    n === 'total general' ||
    n === 'grand total' ||
    n === 'total' ||
    n === 'sous-total' ||
    n === 'subtotal' ||
    n.startsWith('total ') ||
    n.endsWith(' total') ||
    n.includes('total general') ||
    n.includes('grand total')
  );
}

function isHeaderLabel(s) {
  return HEADER_LABELS.has(normalize(s));
}

/** Valeur effective d'une cellule (suit les formules jusqu'au résultat). */
function cellValue(cell) {
  const v = cell ? cell.value : null;
  if (v == null) return null;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if ('result' in v) return v.result ?? null;
    if ('text' in v) return v.text;
    if (v instanceof Date) return v;
    // sharedFormula sans result : on considère vide
  }
  return v;
}

/** Vérifie si la cellule contient une formule (et non une valeur brute). */
function isFormulaCell(cell) {
  const v = cell ? cell.value : null;
  if (v == null || typeof v !== 'object') return false;
  return 'formula' in v || 'sharedFormula' in v;
}

function toNumber(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/\s/g, '').replace(',', '.');
    if (cleaned === '' || cleaned === '-') return 0;
    const n = Number(cleaned);
    if (isFinite(n)) return n;
  }
  return null;
}

/**
 * Détecte si un onglet est un onglet "budget" en cherchant le mot "forecast"
 * (normalisé) dans la colonne K des 15 premières lignes non vides.
 */
function isBudgetSheet(ws) {
  let found = false;
  let scanned = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (found || scanned >= 15) return;
    scanned++;
    const k = cellValue(row.getCell('K'));
    if (typeof k === 'string' && normalize(k).includes('forecast')) {
      found = true;
    }
  });
  return found;
}

function emptyAgg() {
  return { initial: 0, consomme: 0, fleche: 0, rows: 0 };
}

function buildView(name, agg) {
  const initial = agg.initial || 0;
  const consomme = agg.consomme || 0;
  const fleche = agg.fleche || 0;
  const reste = initial - consomme - fleche;
  const engagementRatio = initial > 0 ? (consomme + fleche) / initial : null;
  return {
    name,
    initial,
    consomme,
    fleche,
    reste,
    engagementRatio,
    isOverBudget: reste < 0,
    rowsCount: agg.rows,
  };
}

async function extractBudget(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  /** @type {Array<{sheet:string,rowNum:number,service:string,budgetInitial:number,budgetConsomme:number,budgetFleche:number,resteADepenser:number}>} */
  const details = [];
  /** @type {Object.<string, {initial:number,consomme:number,fleche:number,rows:number}>} */
  const byService = {};

  const warnings = [];
  const sheetsProcessed = [];
  let kept = 0;
  let ignored = 0;
  let outlineLevel1Count = 0;
  let outlineLevel1Kept = 0;

  for (const ws of wb.worksheets) {
    if (!ws || ws.actualRowCount === 0) {
      sheetsProcessed.push({ name: ws ? ws.name : '?', kept: 0, ignored: 0, empty: true, skipped: false });
      continue;
    }

    if (!isBudgetSheet(ws)) {
      sheetsProcessed.push({ name: ws.name, kept: 0, ignored: 0, empty: false, skipped: true });
      continue;
    }

    let sheetKept = 0;
    let sheetIgnored = 0;

    ws.eachRow({ includeEmpty: false }, (row) => {
      if (row.outlineLevel === 1) outlineLevel1Count++;

      // Colonne A : doit être une chaîne brute (pas une formule)
      const cellA = row.getCell('A');
      if (isFormulaCell(cellA)) { sheetIgnored++; return; }

      const aRaw = cellValue(cellA);
      if (typeof aRaw !== 'string' || aRaw.trim() === '') { sheetIgnored++; return; }

      const serviceName = aRaw.trim();

      if (isTotalLabel(serviceName)) { sheetIgnored++; return; }
      if (isHeaderLabel(serviceName)) { sheetIgnored++; return; }

      // Colonnes K, L, M
      const kRaw = cellValue(row.getCell('K'));
      const lRaw = cellValue(row.getCell('L'));
      const mRaw = cellValue(row.getCell('M'));

      const kNum = toNumber(kRaw);
      const lNum = toNumber(lRaw);
      const mNum = toNumber(mRaw);

      // Exiger au moins une valeur non nulle (|val| > 0)
      const magnitude =
        Math.abs(kNum ?? 0) + Math.abs(lNum ?? 0) + Math.abs(mNum ?? 0);
      if (magnitude === 0) { sheetIgnored++; return; }

      // Exclure libellés de total dans les colonnes budget
      for (const v of [kRaw, lRaw, mRaw]) {
        if (typeof v === 'string' && isTotalLabel(v)) {
          sheetIgnored++;
          return;
        }
      }

      // Sous-lignes Excel (outline > 1) rejetées
      if (row.outlineLevel > 1) { sheetIgnored++; return; }

      const budgetInitial = kNum ?? 0;
      const budgetConsomme = lNum ?? 0;
      const budgetFleche = mNum ?? 0;
      const resteADepenser = budgetInitial - budgetConsomme - budgetFleche;

      if (!byService[serviceName]) byService[serviceName] = emptyAgg();
      byService[serviceName].initial += budgetInitial;
      byService[serviceName].consomme += budgetConsomme;
      byService[serviceName].fleche += budgetFleche;
      byService[serviceName].rows += 1;

      details.push({
        sheet: ws.name,
        rowNum: row.number,
        service: serviceName,
        budgetInitial,
        budgetConsomme,
        budgetFleche,
        resteADepenser,
      });

      sheetKept++;
      if (row.outlineLevel === 1) outlineLevel1Kept++;
    });

    kept += sheetKept;
    ignored += sheetIgnored;
    sheetsProcessed.push({ name: ws.name, kept: sheetKept, ignored: sheetIgnored, empty: false, skipped: false });
  }

  // Avertissements
  const usedFallback = outlineLevel1Kept === 0;
  if (usedFallback) {
    warnings.push(
      `Stratégie de secours outlineLevel appliquée : ${outlineLevel1Count} ligne(s) avec outlineLevel=1 trouvée(s) dans le classeur, mais aucune ne correspond à une ligne de données budget exploitable. Les lignes avec outlineLevel=0 sont conservées (exclusion stricte des formules, des totaux et des en-têtes).`
    );
  }

  const budgetSheetsCount = sheetsProcessed.filter(s => !s.skipped && !s.empty).length;
  if (budgetSheetsCount === 0) {
    warnings.push(
      "Aucun onglet budget détecté. Vérifiez que le fichier Excel contient des onglets avec l'en-tête \"Forecast (Calculé)\" en colonne K."
    );
  }
  if (kept === 0 && budgetSheetsCount > 0) {
    warnings.push(
      "Les onglets budget ont été détectés, mais aucune ligne exploitable n'a été retenue (colonne A vide, valeurs K/L/M toutes nulles, ou lignes de total)."
    );
  }

  // Construction des vues : services triés alphabétiquement
  const serviceNames = Object.keys(byService).sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' })
  );
  const services = serviceNames.map(name => buildView(name, byService[name]));

  const globalAgg = Object.values(byService).reduce((acc, a) => {
    acc.initial += a.initial;
    acc.consomme += a.consomme;
    acc.fleche += a.fleche;
    acc.rows += a.rows;
    return acc;
  }, emptyAgg());
  const global = buildView('Global', globalAgg);

  return {
    global,
    services,
    details,
    warnings,
    stats: {
      rowsKept: kept,
      rowsIgnored: ignored,
      budgetSheetsDetected: budgetSheetsCount,
      sheets: sheetsProcessed,
      outlineLevel1Total: outlineLevel1Count,
      outlineLevel1Kept,
      outlineLevelFallback: usedFallback,
    },
  };
}

module.exports = { extractBudget };
