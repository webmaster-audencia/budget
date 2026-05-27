import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Filters } from './components/Filters';
import { KpiCards } from './components/KpiCards';
import { ProgressSection } from './components/ProgressSection';
import { CommentSection } from './components/CommentSection';
import { DetailTable } from './components/DetailTable';
import { exportNodeToPdf } from './exportPdf';
import type { BudgetResponse, ServiceView } from './types';
import { formatDateFr } from './format';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; status?: number }
  | { kind: 'ready'; data: BudgetResponse };

const STORAGE_KEY = 'audencia-budget-comments-v3';

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

  const isGlobal = activeView === 'Global';
  const serviceNames = state.kind === 'ready' ? state.data.services.map((s) => s.service) : [];

  // Sélection rapide côté client (aucun recalcul lourd, aucun nouvel appel API).
  const selected: ServiceView | null = useMemo(() => {
    if (state.kind !== 'ready' || isGlobal) return null;
    return state.data.services.find((s) => s.service === activeView) ?? null;
  }, [state, activeView, isGlobal]);

  // Totaux affichés (KPI + progression) : global ou service sélectionné.
  const totals = useMemo(() => {
    if (state.kind !== 'ready') return null;
    if (isGlobal) return state.data.global;
    return selected
      ? {
          budgetDedie: selected.budgetDedie,
          consomme: selected.consomme,
          fleche: selected.fleche,
          resteADepenser: selected.resteADepenser,
          avancement: selected.avancement,
          isOverBudget: selected.isOverBudget,
        }
      : null;
  }, [state, isGlobal, selected]);

  // Services à afficher dans le tableau de détail.
  const tableServices: ServiceView[] = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return isGlobal ? state.data.services : selected ? [selected] : [];
  }, [state, isGlobal, selected]);

  const viewName = isGlobal ? 'Global' : activeView;
  const commentValue = comments[viewName] ?? '';
  const onCommentChange = useCallback(
    (v: string) => setComments((prev) => ({ ...prev, [viewName]: v })),
    [viewName]
  );

  const handleExport = useCallback(async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 120)); // laisse le DOM se mettre à jour (groupes dépliés)
      const date = new Date().toISOString().slice(0, 10);
      const safe = viewName.replace(/\s+/g, '_').replace(/[^\w\-]/g, '');
      await exportNodeToPdf(exportRef.current, `Audencia_Budget_${safe}_${date}.pdf`);
    } catch (e) {
      console.error('Export PDF :', e);
      alert("L'export PDF a échoué. Voir la console pour le détail.");
    } finally {
      setExporting(false);
    }
  }, [viewName]);

  return (
    <div className="app">
      <Header />
      <main className="main">
        <div className="main-inner">

          {state.kind === 'loading' && (
            <div className="state-card">
              <div className="spinner" />
              <h3>Analyse du fichier budgétaire en cours…</h3>
              <p>Lecture des onglets CONSO et BUDGET, agrégation par service.</p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="state-card">
              <h3>Impossible de charger les données</h3>
              <p>
                Vérifiez la source du fichier : lien SharePoint téléchargeable
                (<code>BUDGET_FILE_URL</code>), chemin local (<code>BUDGET_FILE_PATH</code>),
                ou fichier <code>.xlsx</code> dans <code>/data</code>. Le backend doit tourner sur{' '}
                <code>localhost:4000</code>.
              </p>
              <div className="state-error">{state.message}</div>
            </div>
          )}

          {state.kind === 'ready' && totals && (
            <>
              <Filters services={serviceNames} active={activeView} onChange={setActiveView} />

              {state.data.warnings.length > 0 && (
                <details className="warnings no-print">
                  <summary><strong>Avertissements d'extraction</strong> ({state.data.warnings.length})</summary>
                  <ul>
                    {state.data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}

              {/* Zone capturée pour le PDF */}
              <div ref={exportRef} className="export-capture">
                <div className="view-header">
                  <div className="view-brand-pdf">
                    <img src="/logo-audencia.svg" alt="Audencia" className="pdf-logo" />
                  </div>
                  <div className="view-title-wrap">
                    <div className="view-eyebrow">Direction de la Communication & Marketing</div>
                    <h2 className="view-title">
                      {isGlobal ? (
                        <>Vue <span className="highlight">globale</span> — Suivi budgétaire</>
                      ) : (
                        <>Service : <span className="highlight">{viewName}</span></>
                      )}
                    </h2>
                  </div>
                  <span className="view-date">{formatDateFr()}</span>
                </div>

                <KpiCards
                  budgetDedie={totals.budgetDedie}
                  consomme={totals.consomme}
                  fleche={totals.fleche}
                  reste={totals.resteADepenser}
                  isOverBudget={totals.isOverBudget}
                />
                <ProgressSection
                  budgetDedie={totals.budgetDedie}
                  consomme={totals.consomme}
                  fleche={totals.fleche}
                  reste={totals.resteADepenser}
                  avancement={totals.avancement}
                  isOverBudget={totals.isOverBudget}
                />
                <CommentSection
                  viewName={viewName}
                  value={commentValue}
                  onChange={onCommentChange}
                  readonly={exporting}
                />
                <DetailTable services={tableServices} isGlobal={isGlobal} forceOpen={exporting} />
              </div>

              <div className="actions no-print">
                <button type="button" className="btn btn-primary" onClick={handleExport} disabled={exporting}>
                  {exporting ? 'Export en cours…' : 'Exporter en PDF'}
                </button>
              </div>

              <div className="footer no-print">
                Source : {state.data.source}
                {state.data.fileUpdatedAt && ` — fichier daté du ${formatDateFr(new Date(state.data.fileUpdatedAt))}`}
                {' — '}{state.data.stats.servicesDetected} service(s) détecté(s)
                {' · '}CONSO col.service={state.data.stats.consoColumns?.service ?? '?'}
                {' · '}BUDGET col.service={state.data.stats.budgetColumns?.service ?? '?'}
                {' · '}cache {state.data.cacheUsed ? 'utilisé' : 'mis à jour'}.
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
