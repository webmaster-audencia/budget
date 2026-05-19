import type { BudgetView } from '../types';
import { formatEUR } from '../format';

interface Props { view: BudgetView; }

export function KpiCards({ view }: Props) {
  const overspent = view.isOverBudget;
  return (
    <div className="kpis">
      <div className="kpi-card">
        <div className="kpi-label">Budget initial</div>
        <div className="kpi-value">{formatEUR(view.initial)}</div>
        <div className="kpi-hint">Forecast (Calculé)</div>
      </div>

      <div className="kpi-card blue">
        <div className="kpi-label">Budget consommé</div>
        <div className="kpi-value">{formatEUR(view.consomme)}</div>
        <div className="kpi-hint">Dépenses engagées</div>
      </div>

      <div className="kpi-card teal">
        <div className="kpi-label">Budget fléché</div>
        <div className="kpi-value">{formatEUR(view.fleche)}</div>
        <div className="kpi-hint">Engagements à venir</div>
      </div>

      <div className={`kpi-card ${overspent ? 'warn' : 'green'}`}>
        <div className="kpi-label">
          {overspent ? 'Dépassement' : 'Reste à dépenser'}
        </div>
        <div className={`kpi-value ${overspent ? 'negative' : ''}`}>
          {formatEUR(view.reste)}
        </div>
        <div className="kpi-hint">
          {overspent ? 'Budget initial dépassé' : 'Initial − consommé − fléché'}
        </div>
      </div>
    </div>
  );
}
