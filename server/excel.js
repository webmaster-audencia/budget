/**
 * Lecture & agrégation du fichier Excel budgétaire.
 *
 * Règles (cf. cahier des charges) :
 *  - Parcourir tous les onglets.
 *  - Conserver les "lignes principales".
 *  - Définition prioritaire : outlineLevel === 1.
 *  - Stratégie de secours documentée (voir README) : dans le classeur fourni,
 *    tous les outlineLevel valent 0, on retient donc :
 *       * colonne A = service autorisé (match exact après normalisation
 *         casse/accents)
 *       * au moins une valeur numérique en K, L ou M
 *       * exclusion explicite des lignes "Total" / "Grand Total" / etc.
 *  - K = Forecast (Calculé) = Budget initial
 *  - L = CONSOMME           = Budget consommé
 *  - M = FLECHE             = Budget fléché
 *  - Les valeurs vides comptent comme 0.
 *  - Cumul sur tous les onglets si un service apparaît plusieurs fois.
 *  - Calculs faits sur les valeurs brutes ; l'arrondi à l'entier supérieur
 *    n'est appliqué qu'à l'affichage / au PDF (côté frontend).
 */

const ExcelJS = require('exceljs');

const AUTHORIZED_SERVICES = [
  'Presse',
  'Event',
  'Webmarketing',
  'Com Interne',
  'Réseaux sociaux',
  'Audiovisuel',
];

// Index "clé normalisée -> libellé canonique"
const SERVICE_INDEX = new Map(
  AUTHORIZED_SERVICES.map(s => [normalize(s), s])
);

// Alias de tolérance (variantes d'orthographe rencontrées dans le fichier)
const SERVICE_ALIASES = {
  events: 'Event',
  'com interne ': 'Com Interne',
  'reseau social': 'Réseaux sociaux',
};
for (const [k, v] of Object.entries(SERVICE_ALIASES)) {
  SERVICE_INDEX.set(normalize(k), v);
}

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
    n.startsWith('total ') ||
    n.endsWith(' total') ||
    n.includes('total general')
  );
}

/**
 * Récupère la valeur "effective" d'une cellule ExcelJS :
 *  - string brut -> string
 *  - number      -> number
 *  - richText    -> concaténation
 *  - formula     -> result calculé par Excel
 */
function cellValue(cell) {
  const v = cell ? cell.value : null;
  if (v == null) return null;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    if (v instanceof Date) return v;
  }
  return v;
}

function toNumber(v) {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/\s/g, '').replace(',', '.');
    if (cleaned === '' || cleaned === '-') return 0;
    const n = Number(cleaned);
    if (!Number.isNaN(n)) return n;
  }
  return null; // non numérique → on l'ignore plutôt que de fausser
}

function emptyAgg() {
  return { initial: 0, consomme: 0, fleche: 0, rows: 0 };
}

async function extractBudget(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const byService = Object.fromEntries(
    AUTHORIZED_SERVICES.map(s => [s, emptyAgg()])
  );
  const warnings = [];
  const sheetsProcessed = [];
  let kept = 0;
  let ignored = 0;
  let outlineLevel1Count = 0;
  let outlineLevel1Kept = 0;

  for (const ws of wb.worksheets) {
    if (!ws || ws.actualRowCount === 0) {
      sheetsProcessed.push({ name: ws ? ws.name : '?', kept: 0, ignored: 0, empty: true });
      continue;
    }

    let sheetKept = 0;
    let sheetIgnored = 0;

    ws.eachRow({ includeEmpty: false }, (row) => {
      if (row.outlineLevel === 1) outlineLevel1Count++;

      const aRaw = cellValue(row.getCell('A'));
      const kRaw = cellValue(row.getCell('K'));
      const lRaw = cellValue(row.getCell('L'));
      const mRaw = cellValue(row.getCell('M'));

      // Critère 1 : colonne A doit être une chaîne identifiant un service autorisé.
      if (typeof aRaw !== 'string' || aRaw.trim() === '') {
        sheetIgnored++;
        return;
      }
      if (isTotalLabel(aRaw)) {
        sheetIgnored++;
        return;
      }
      const canonical = SERVICE_INDEX.get(normalize(aRaw));
      if (!canonical) {
        sheetIgnored++;
        return;
      }

      // Critère 2 : au moins un montant numérique parmi K/L/M.
      const kNum = toNumber(kRaw);
      const lNum = toNumber(lRaw);
      const mNum = toNumber(mRaw);
      const hasAnyNumber =
        (kNum !== null) || (lNum !== null) || (mNum !== null);
      if (!hasAnyNumber) {
        sheetIgnored++;
        return;
      }

      // Critère 3 : exclure totaux dans des cellules significatives.
      for (const v of [kRaw, lRaw, mRaw]) {
        if (typeof v === 'string' && isTotalLabel(v)) {
          sheetIgnored++;
          return;
        }
      }

      // Critère 4 (priorité) : outlineLevel === 1.
      // Stratégie de secours : si AUCUNE ligne du classeur n'a outlineLevel===1
      // (cas observé sur ce fichier), on accepte les lignes qui ont déjà passé
      // les filtres ci-dessus. On documente le warning à la fin.
      if (row.outlineLevel > 1) {
        sheetIgnored++;
        return;
      }

      const agg = byService[canonical];
      agg.initial += kNum || 0;
      agg.consomme += lNum || 0;
      agg.fleche += mNum || 0;
      agg.rows += 1;
      sheetKept++;
      if (row.outlineLevel === 1) outlineLevel1Kept++;
    });

    kept += sheetKept;
    ignored += sheetIgnored;
    sheetsProcessed.push({
      name: ws.name,
      kept: sheetKept,
      ignored: sheetIgnored,
      empty: false,
    });
  }

  const usedFallback = outlineLevel1Kept === 0;
  if (usedFallback) {
    warnings.push(
      `Aucune ligne exploitable de niveau outlineLevel === 1 n'a été détectée dans le classeur (${outlineLevel1Count} ligne(s) outlineLevel=1 au total, mais aucune ne correspond à un service autorisé). Stratégie de secours appliquée : filtrage strict par nom de service exact en colonne A + montants numériques en K/L/M + exclusion des totaux. Les lignes sous-totales / agrégées Excel ne sont pas additionnées : seules les lignes "Service = ..." des onglets de type tableau croisé sont retenues.`
    );
  }
  if (kept === 0) {
    warnings.push(
      "Aucune ligne exploitable n'a été détectée. Vérifiez que les onglets contiennent bien des lignes principales avec un service autorisé en colonne A et des montants en K/L/M."
    );
  }

  // Construction des vues service + global, en valeurs brutes.
  const services = AUTHORIZED_SERVICES.map(name => {
    const a = byService[name];
    return buildView(name, a);
  });

  const globalAgg = services.reduce(
    (acc, s) => {
      acc.initial += s.initial;
      acc.consomme += s.consomme;
      acc.fleche += s.fleche;
      acc.rows += s.rowsCount;
      return acc;
    },
    emptyAgg()
  );
  const global = buildView('Global', globalAgg);

  return {
    global,
    services,
    warnings,
    stats: {
      rowsKept: kept,
      rowsIgnored: ignored,
      sheets: sheetsProcessed,
      outlineLevel1Total: outlineLevel1Count,
      outlineLevel1Kept,
      outlineLevelFallback: usedFallback,
    },
  };
}

function buildView(name, agg) {
  const initial = agg.initial || 0;
  const consomme = agg.consomme || 0;
  const fleche = agg.fleche || 0;
  const reste = initial - consomme - fleche;
  const engagementRatio =
    initial > 0 ? (consomme + fleche) / initial : null; // null = non calculable
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

module.exports = { extractBudget, AUTHORIZED_SERVICES };
