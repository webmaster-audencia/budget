import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Filters } from './components/Filters';
import { KpiCards } from './components/KpiCards';
import { ProgressSection } from './components/ProgressSection';
import { CommentSection } from './components/CommentSection';
import { DetailTable } from './components/DetailTable';
import { exportNodeToPdf } from './exportPdf';
import type { BudgetResponse, BudgetView, DetailRow } from './types';
import { formatDateFr } from './format';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; status?: number }
  | { kind: 'ready'; data: BudgetResponse };

const STORAGE_KEY = 'audencia-budget-comments-v2';

function App() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [activeView, setActiveView] = useState<string>('Global');
  const [comments, setComments] = useState<Record<string, string>>(() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}'); }
    catch { return {}; }
  });
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/budget')
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw Object.assign(new Error(body.message || `Erreur HTTP ${r.status}`), { status: r.status });
        }
        return r.json() as Promise<BudgetResponse>;
      })
      .then((data) => setState({ kind: 'ready', data }))
      .catch((err: Error & { status?: number }) =>
        setState({ kind: 'error', message: err.message, status: err.status })
      );
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(comments)); }
    catch { /* indisponible */ }
  }, [comments]);

  const serviceNames = state.kind === 'ready' ? state.data.services.map((s) => s.name) : [];

  const currentView: BudgetView | null = useMemo(() => {
    if (state.kind !== 'ready') return null;
    if (activeView === 'Global') return state.data.global;
    return state.data.services.find((s) => s.name === activeView) ?? state.data.global;
  }, [state, activeView]);

  const currentDetails: DetailRow[] = useMemo(() => {
    if (state.kind !== 'ready') return [];
    if (activeView === 'Global') return state.data.details;
    return state.data.details.filter((r) => r.service === activeView);
  }, [state, activeView]);

  const isGlobal = activeView === 'Global';

  async function handleExport() {
    if (!exportRef.current || !currentView) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 80));
      const date = new Date().toISOString().slice(0, 10);
      const safe = currentView.name.replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
      await exportNodeToPdf(exportRef.current, `Audencia_Budget_${safe}_${date}.pdf`);
    } catch (e) {
      console.error('Export PDF :', e);
      alert("L'export PDF a échoué. Voir la console pour le détail.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app">
      <Header />
      <main className="main">
        <div className="main-inner">

          {state.kind === 'loading' && (
            <div className="state-card">
              <div className="spinner" />
              <h3>Lecture du fichier budgétaire…</h3>
              <p>Agrégation des données par service.</p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="state-card">
              <h3>Impossible de charger les données</h3>
              <p>
                {state.status === 404
                  ? 'Le fichier Excel est introuvable.'
                  : "Le serveur n'a pas pu lire le fichier Excel."}
              </p>
              <p>
                Vérifiez qu'un fichier <code>.xlsx</code> est dans le dossier <code>/data</code>{' '}
                et que le backend tourne sur <code>localhost:4000</code>.
              </p>
              <div className="state-error">{state.message}</div>
            </div>
          )}

          {state.kind === 'ready' && currentView && (
            <>
              <Filters services={serviceNames} active={activeView} onChange={setActiveView} />

              {state.data.warnings.length > 0 && (
                <div className="warnings no-print">
                  <strong>Avertissements d'extraction :</strong>
                  <ul>
                    {state.data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Zone capturée pour le PDF */}
              <div ref={exportRef}>
                <div className="view-header">
                  <div className="view-title-wrap">
                    <div className="view-eyebrow">Direction Communication & Marketing</div>
                    <h2 className="view-title">
                      {isGlobal ? (
                        <>Vue <span className="highlight">globale</span> — Budget marketing</>
                      ) : (
                        <>Service : <span className="highlight">{currentView.name}</span></>
                      )}
                    </h2>
                  </div>
                  <span className="view-date">{formatDateFr()}</span>
                </div>

                <KpiCards view={currentView} />
                <ProgressSection view={currentView} />
                <CommentSection
                  viewName={currentView.name}
                  value={comments[currentView.name] ?? ''}
                  onChange={(v) => setComments((prev) => ({ ...prev, [currentView.name]: v }))}
                  readonly={exporting}
                />
                <DetailTable rows={currentDetails} isGlobal={isGlobal} />
              </div>

              <div className="actions no-print">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? 'Export en cours…' : 'Exporter en PDF'}
                </button>
              </div>

              <div className="footer no-print">
                Fichier source : {state.data.file} — {state.data.stats.rowsKept} lignes retenues
                sur {state.data.stats.budgetSheetsDetected} onglet(s) budget détecté(s).
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
