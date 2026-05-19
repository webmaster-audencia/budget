import type { BudgetView } from '../types';
import { formatEUR, formatPercent } from '../format';

interface Props { view: BudgetView; }

export function ProgressSection({ view }: Props) {
  const { initial, consomme, fleche, reste, engagementRatio, isOverBudget } = view;
  const notCalc = engagementRatio === null;

  let pctConsomme = 0;
  let pctFleche = 0;

  if (!notCalc && initial > 0) {
    const rc = consomme / initial;
    const rf = fleche / initial;
    const re = rc + rf;
    if (re <= 1) {
      pctConsomme = rc * 100;
      pctFleche = rf * 100;
    } else {
      pctConsomme = (rc / re) * 100;
      pctFleche = (rf / re) * 100;
    }
  }

  return (
    <section className="progress-section">
      <div className="progress-header">
        <h3 className="progress-title">Avancement de l'engagement budgétaire</h3>
        <div className="progress-pct">
          {notCalc ? '—' : formatPercent(engagementRatio)}
        </div>
      </div>

      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={notCalc ? 0 : Math.round((engagementRatio ?? 0) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {!notCalc && (
          <>
            <div
              className="progress-seg consomme"
              style={{ width: `${pctConsomme}%` }}
              title={`Consommé : ${formatEUR(consomme)}`}
            />
            <div
              className="progress-seg fleche"
              style={{ width: `${pctFleche}%` }}
              title={`Fléché : ${formatEUR(fleche)}`}
            />
          </>
        )}
      </div>

      <div className="progress-legend">
        <span className="legend-item">
          <span className="legend-dot consomme" />
          Consommé
          <span className="legend-amount">{formatEUR(consomme)}</span>
        </span>
        <span className="legend-item">
          <span className="legend-dot fleche" />
          Fléché
          <span className="legend-amount">{formatEUR(fleche)}</span>
        </span>
        <span className="legend-item">
          <span className="legend-dot reste" />
          {isOverBudget ? 'Dépassement' : 'Reste'}
          <span className="legend-amount">{formatEUR(reste)}</span>
        </span>
      </div>

      {isOverBudget && (
        <div className="progress-overflow">
          Dépassement budgétaire de {formatEUR(Math.abs(reste))} — l'enveloppe initiale est dépassée.
        </div>
      )}
      {notCalc && (
        <div className="progress-uncalc">
          Avancement non calculable : budget initial égal à 0 sur ce périmètre.
        </div>
      )}
    </section>
  );
}
