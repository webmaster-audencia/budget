import { memo } from 'react';
import { formatEUR } from '../format';

interface Props {
  budgetDedie: number;
  consomme: number;
  fleche: number;
  reste: number;
  isOverBudget: boolean;
}

export const KpiCards = memo(function KpiCards({ budgetDedie, consomme, fleche, reste, isOverBudget }: Props) {
  return (
    <div className="kpis">
      <div className="kpi-card">
        <div className="kpi-label">Budget dédié</div>
        <div className="kpi-value">{formatEUR(budgetDedie)}</div>
        <div className="kpi-hint">Onglet BUDGET (par service)</div>
      </div>

      <div className="kpi-card blue">
        <div className="kpi-label">Consommé</div>
        <div className="kpi-value">{formatEUR(consomme)}</div>
        <div className="kpi-hint">Dépenses engagées</div>
      </div>

      <div className="kpi-card teal">
        <div className="kpi-label">Fléché</div>
        <div className="kpi-value">{formatEUR(fleche)}</div>
        <div className="kpi-hint">Engagements à venir</div>
      </div>

      <div className={`kpi-card ${isOverBudget ? 'warn' : 'green'}`}>
        <div className="kpi-label">{isOverBudget ? 'Dépassement' : 'Reste à dépenser'}</div>
        <div className={`kpi-value ${isOverBudget ? 'negative' : ''}`}>{formatEUR(reste)}</div>
        <div className="kpi-hint">{isOverBudget ? 'Budget dédié dépassé' : 'Dédié − consommé − fléché'}</div>
      </div>
    </div>
  );
});
