import { memo, useState, useCallback } from 'react';
import type { ServiceView } from '../types';
import { formatEUR } from '../format';

interface Props {
  services: ServiceView[];
  isGlobal: boolean;
  forceOpen?: boolean;
}

function resteClass(v: number, forDarkRow = false) {
  const pos = forDarkRow ? 'gt-positive' : 'reste-positive';
  const neg = forDarkRow ? 'gt-negative' : 'reste-negative';
  if (v < 0) return `num ${neg}`;
  return `num ${pos}`; // positif ou nul → vert (selon charte)
}

const COLS = 6;

const ServiceRows = memo(function ServiceRows({
  s,
  expandable,
  defaultOpen,
  forceOpen,
}: {
  s: ServiceView;
  expandable: boolean;
  defaultOpen: boolean;
  forceOpen?: boolean;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setLocalOpen((o) => !o), []);
  const open = forceOpen || localOpen;

  return (
    <>
      {expandable && (
        <tr className="group-header" onClick={toggle} style={{ cursor: 'pointer' }}>
          <td colSpan={COLS}>
            <span className="group-chevron">{open ? '▾' : '▸'}</span>
            {s.service}
            <span className="group-count">
              {s.lignesDetail.length} ligne{s.lignesDetail.length > 1 ? 's' : ''}
            </span>
          </td>
        </tr>
      )}

      {open &&
        s.lignesDetail.map((r, i) => (
          <tr key={`${s.service}-${i}`}>
            <td className="detail-label">
              {r.detailLabel}
              {r.sourceRows > 1 && <span className="src-count"> ×{r.sourceRows}</span>}
            </td>
            <td className="detail-svc">{r.service}</td>
            <td className="num">{formatEUR(r.budgetDedie)}</td>
            <td className="num">{formatEUR(r.consomme)}</td>
            <td className="num">{formatEUR(r.fleche)}</td>
            <td className={resteClass(r.resteADepenser)}>{formatEUR(r.resteADepenser)}</td>
          </tr>
        ))}

      {open && s.lignesDetail.length === 0 && (
        <tr>
          <td colSpan={COLS} className="muted" style={{ fontStyle: 'italic' }}>
            Aucune ligne de consommation (CONSO) pour ce service.
          </td>
        </tr>
      )}

      <tr className="subtotal">
        <td>{expandable ? `Total ${s.service}` : `TOTAL ${s.service}`}</td>
        <td />
        <td className="num">{formatEUR(s.budgetDedie)}</td>
        <td className="num">{formatEUR(s.consomme)}</td>
        <td className="num">{formatEUR(s.fleche)}</td>
        <td className={resteClass(s.resteADepenser)}>{formatEUR(s.resteADepenser)}</td>
      </tr>
    </>
  );
});

export const DetailTable = memo(function DetailTable({ services, isGlobal, forceOpen }: Props) {
  if (services.length === 0) {
    return (
      <section className="detail-section">
        <h3 className="detail-title">Détail des dépenses</h3>
        <p className="muted" style={{ fontSize: 13 }}>Aucune donnée pour cette sélection.</p>
      </section>
    );
  }

  const grand = services.reduce(
    (acc, s) => {
      acc.budgetDedie += s.budgetDedie;
      acc.consomme += s.consomme;
      acc.fleche += s.fleche;
      acc.reste += s.resteADepenser;
      return acc;
    },
    { budgetDedie: 0, consomme: 0, fleche: 0, reste: 0 }
  );

  return (
    <section className="detail-section">
      <h3 className="detail-title">Détail des dépenses</h3>
      <div className="detail-hint no-print">
        Détail = <strong>Partie — Ensemble</strong> (onglet CONSO). Le budget dédié est sommé ligne par
        ligne depuis la colonne <strong>FORECAST AU 2 JUIN - VIRGINIE</strong>. Reste à dépenser =
        Budget dédié − Consommé − Fléché, coloré vert (≥ 0) ou rouge (&lt; 0).
        {isGlobal && ' Cliquez sur un service pour déplier son détail.'}
      </div>
      <div className="detail-table-wrap">
        <table className="detail-table">
          <thead>
            <tr>
              <th>Détail</th>
              <th>Service</th>
              <th className="num">Budget dédié</th>
              <th className="num">Consommé</th>
              <th className="num">Fléché</th>
              <th className="num">Reste à dépenser</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <ServiceRows key={s.service} s={s} expandable={isGlobal} defaultOpen={!isGlobal} forceOpen={forceOpen} />
            ))}

            {isGlobal && (
              <tr className="grand-total">
                <td>TOTAL GÉNÉRAL</td>
                <td />
                <td className="num">{formatEUR(grand.budgetDedie)}</td>
                <td className="num">{formatEUR(grand.consomme)}</td>
                <td className="num">{formatEUR(grand.fleche)}</td>
                <td className={resteClass(grand.reste, true)}>{formatEUR(grand.reste)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
});
