/**
 * Audencia – Suivi budgétaire marketing.
 * Serveur Express local. Lit uniquement les onglets CONSO et BUDGET du fichier
 * Excel (SharePoint si configuré, sinon fallback local), agrège côté serveur,
 * met le résultat en cache mémoire et expose /api/budget.
 */
const express = require('express');
const cors = require('cors');
const { loadData, probeVersion, resolveSource } = require('./source');
const { aggregate } = require('./excel');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

// Cache mémoire : { version, payload }
let cache = null;

async function getBudget() {
  // Étape rapide : version sans parsing. Si inchangée → cache HIT immédiat.
  const probed = await probeVersion();
  if (cache && probed && cache.version === probed) {
    console.log('[budget] cache HIT (version inchangée) — pas de relecture Excel');
    return { ...cache.payload, cacheUsed: true };
  }

  const data = await loadData();
  const { label, version, fetchMs, fileUpdatedAt } = data;
  const { global, services, warnings, stats } = aggregate(data);

  const budgetSrc = stats.consoColumns?.budgetDedieSource === 'header'
    ? `header (col ${stats.consoColumns?.budgetDedie})`
    : `fallback colonne S (col ${stats.consoColumns?.budgetDedie})`;
  console.log(
    `[budget] Excel parsed in ${fetchMs}ms — ${stats.sheetsUsed.length} sheet used ` +
      `(${stats.sheetsUsed.join(', ') || 'none'}) — CONSO ${stats.consoRowsKept || 0}/${stats.consoRowsParsed || 0} kept — ` +
      `budget dédié : ${budgetSrc}, ${stats.budgetDedieRowsWithValue || 0} ligne(s) avec valeur — ` +
      `${stats.servicesDetected} services — aggregated in ${stats.aggregationMs}ms — cache updated`
  );
  if (stats.budgetDedieSampleRows?.length) {
    console.log('[budget] échantillons budget dédié :', stats.budgetDedieSampleRows);
  }

  const payload = {
    source: label,
    fileUpdatedAt,
    generatedAt: new Date().toISOString(),
    global,
    services,
    warnings,
    stats,
    cacheUsed: false,
  };
  cache = { version, payload };
  return payload;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), source: resolveSource().label || 'none' });
});

app.get('/api/budget', async (req, res) => {
  try {
    const payload = await getBudget();
    res.json(payload);
  } catch (err) {
    console.error('[budget] erreur :', err);
    const status = err.code === 'FILE_NOT_FOUND' || err.code === 'NO_SOURCE' ? 404 : 500;
    res.status(status).json({
      error: err.code || 'EXTRACTION_ERROR',
      message: err.message || 'Erreur inconnue lors de la lecture du fichier Excel.',
    });
  }
});

app.listen(PORT, () => {
  const src = resolveSource();
  console.log(`\n  Audencia – serveur budget prêt sur http://localhost:${PORT}`);
  console.log(`  Source : ${src.label || 'aucune (placez un .xlsx dans /data ou définissez BUDGET_FILE_PATH)'}\n`);
});
