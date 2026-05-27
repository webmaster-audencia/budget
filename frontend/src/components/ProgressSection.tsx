import { memo } from 'react';
import { formatEUR, formatPercent } from '../format';

interface Props {
  budgetDedie: number;
  consomme: number;
  fleche: number;
  reste: number;
  avancement: number | null;
  isOverBudget: boolean;
}

export const ProgressSection = memo(function ProgressSection({
  budgetDedie,
  consomme,
  fleche,
  reste,
  avancement,
  isOverBudget,
}: Props) {
  const notCalc = avancement === null;

  let pctConsomme = 0;
  let pctFleche = 0;
  if (!notCalc && budgetDedie > 0) {
    const rc = consomme / budgetDedie;
    const rf = fleche / budgetDedie;
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
        <h3 className="progress-title">Avancement budgétaire</h3>
        <div className="progress-pct">{notCalc ? '—' : formatPercent(avancement)}</div>
      </div>

      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={notCalc ? 0 : Math.round((avancement ?? 0) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {!notCalc && (
          <>
            <div className="progress-seg consomme" style={{ width: `${pctConsomme}%` }} title={`Consommé : ${formatEUR(consomme)}`} />
            <div className="progress-seg fleche" style={{ width: `${pctFleche}%` }} title={`Fléché : ${formatEUR(fleche)}`} />
          </>
        )}
      </div>

      <div className="progress-legend">
        <span className="legend-item">
          <span className="legend-dot consomme" /> Consommé
          <span className="legend-amount">{formatEUR(consomme)}</span>
        </span>
        <span className="legend-item">
          <span className="legend-dot fleche" /> Fléché
          <span className="legend-amount">{formatEUR(fleche)}</span>
        </span>
        <span className="legend-item">
          <span className="legend-dot reste" /> {isOverBudget ? 'Dépassement' : 'Reste'}
          <span className="legend-amount">{formatEUR(reste)}</span>
        </span>
      </div>

      {isOverBudget && (
        <div className="progress-overflow">
          Dépassement budgétaire de {formatEUR(Math.abs(reste))} — le budget dédié est dépassé.
        </div>
      )}
      {notCalc && (
        <div className="progress-uncalc">
          Avancement non calculable : budget dédié égal à 0 sur ce périmètre.
        </div>
      )}
    </section>
  );
});
