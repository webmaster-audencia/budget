/**
 * Audencia – Suivi budgétaire marketing
 * Serveur Express local : lit automatiquement le fichier Excel placé dans /data
 * et expose /api/budget avec les données agrégées par service.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { extractBudget } = require('./excel');


const PORT = process.env.PORT || 4000;
const DATA_DIR = path.resolve(__dirname, '..', 'data');

const app = express();
app.use(cors());
app.use(express.json());

function findExcelFile() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const preferred = 'Essai maquette 2026 AGO_vivi.xlsx';
  const all = fs.readdirSync(DATA_DIR).filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'));
  if (all.includes(preferred)) return path.join(DATA_DIR, preferred);
  if (all.length > 0) return path.join(DATA_DIR, all[0]);
  return null;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/budget', async (req, res) => {
  try {
    const file = findExcelFile();
    if (!file) {
      return res.status(404).json({
        error: 'FILE_NOT_FOUND',
        message: `Aucun fichier Excel trouvé dans ${DATA_DIR}. Placez "Essai maquette 2026 AGO_vivi.xlsx" dans le dossier /data.`,
      });
    }
    const result = await extractBudget(file);
    res.json({
      file: path.basename(file),
      generatedAt: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error('[budget] erreur lecture/agrégation :', err);
    res.status(500).json({
      error: 'EXTRACTION_ERROR',
      message: err.message || 'Erreur inconnue lors de la lecture du fichier Excel.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Audencia – serveur budget prêt sur http://localhost:${PORT}`);
  console.log(`  Dossier data surveillé : ${DATA_DIR}\n`);
});
