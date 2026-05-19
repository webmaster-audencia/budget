import type { DetailRow } from '../types';
import { formatEUR } from '../format';

interface Props {
  rows: DetailRow[];
  isGlobal: boolean;
}

interface ServiceGroup {
  service: string;
  rows: DetailRow[];
  total: {
    budgetInitial: number;
    budgetConsomme: number;
    budgetFleche: number;
    resteADepenser: number;
  };
}

function groupByService(rows: DetailRow[]): ServiceGroup[] {
  const map = new Map<string, DetailRow[]>();
  for (const r of rows) {
    if (!map.has(r.service)) map.set(r.service, []);
    map.get(r.service)!.push(r);
  }
  return Array.from(map.entries()).map(([service, sRows]) => ({
    service,
    rows: sRows,
    total: sRows.reduce(
      (acc, r) => ({
        budgetInitial: acc.budgetInitial + r.budgetInitial,
        budgetConsomme: acc.budgetConsomme + r.budgetConsomme,
        budgetFleche: acc.budgetFleche + r.budgetFleche,
        resteADepenser: acc.resteADepenser + r.resteADepenser,
      }),
      { budgetInitial: 0, budgetConsomme: 0, budgetFleche: 0, resteADepenser: 0 }
    ),
  }));
}

function sumRows(rows: DetailRow[]) {
  return rows.reduce(
    (acc, r) => ({
      budgetInitial: acc.budgetInitial + r.budgetInitial,
      budgetConsomme: acc.budgetConsomme + r.budgetConsomme,
      budgetFleche: acc.budgetFleche + r.budgetFleche,
      resteADepenser: acc.resteADepenser + r.resteADepenser,
    }),
    { budgetInitial: 0, budgetConsomme: 0, budgetFleche: 0, resteADepenser: 0 }
  );
}

function resteClass(v: number, forGrandTotal = false) {
  const pos = forGrandTotal ? 'gt-positive' : 'reste-positive';
  const neg = forGrandTotal ? 'gt-negative' : 'reste-negative';
  if (v > 0) return `num ${pos}`;
  if (v < 0) return `num ${neg}`;
  return 'num reste-zero';
}

export function DetailTable({ rows, isGlobal }: Props) {
  if (rows.length === 0) {
    return (
      <section className="detail-section">
        <h3 className="detail-title">Détail des lignes</h3>
        <p style={{ color: '#8599aa', fontSize: 13 }}>
          Aucune ligne de détail pour cette sélection.
        </p>
      </section>
    );
  }

  const grandTotal = sumRows(rows);
  const groups = isGlobal ? groupByService(rows) : null;

  return (
    <section className="detail-section">
      <h3 className="detail-title">Détail des lignes</h3>
      <div className="detail-table-wrap">
        <table className="detail-table">
          <thead>
            <tr>
              <th>Service</th>
              <th className="num">Budget initial</th>
              <th className="num">Budget consommé</th>
              <th className="num">Budget fléché</th>
              <th className="num">Reste à dépenser</th>
            </tr>
          </thead>
          <tbody>
            {isGlobal && groups ? (
              groups.map((group) => (
                <>
                  {/* En-tête de groupe service */}
                  <tr key={`group-${group.service}`} className="group-header">
                    <td colSpan={5}>{group.service}</td>
                  </tr>

                  {/* Lignes du service */}
                  {group.rows.map((r, i) => (
                    <tr key={`${r.sheet}-${r.rowNum}-${i}`}>
                      <td style={{ paddingLeft: 28, color: '#4a6070', fontSize: 12.5 }}>
                        {r.service}
                        <span style={{ color: '#a0b4bf', fontSize: 11, marginLeft: 6 }}>
                          ({r.sheet})
                        </span>
                      </td>
                      <td className="num">{formatEUR(r.budgetInitial)}</td>
                      <td className="num">{formatEUR(r.budgetConsomme)}</td>
                      <td className="num">{formatEUR(r.budgetFleche)}</td>
                      <td className={resteClass(r.resteADepenser)}>
                        {formatEUR(r.resteADepenser)}
                      </td>
                    </tr>
                  ))}

                  {/* Sous-total service (si > 1 ligne) */}
                  {group.rows.length > 1 && (
                    <tr key={`sub-${group.service}`} className="subtotal">
                      <td>Sous-total {group.service}</td>
                      <td className="num">{formatEUR(group.total.budgetInitial)}</td>
                      <td className="num">{formatEUR(group.total.budgetConsomme)}</td>
                      <td className="num">{formatEUR(group.total.budgetFleche)}</td>
                      <td className={resteClass(group.total.resteADepenser)}>
                        {formatEUR(group.total.resteADepenser)}
                      </td>
                    </tr>
                  )}
                </>
              ))
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.sheet}-${r.rowNum}-${i}`}>
                  <td>
                    {r.service}
                    <span style={{ color: '#a0b4bf', fontSize: 11, marginLeft: 6 }}>
                      ({r.sheet})
                    </span>
                  </td>
                  <td className="num">{formatEUR(r.budgetInitial)}</td>
                  <td className="num">{formatEUR(r.budgetConsomme)}</td>
                  <td className="num">{formatEUR(r.budgetFleche)}</td>
                  <td className={resteClass(r.resteADepenser)}>
                    {formatEUR(r.resteADepenser)}
                  </td>
                </tr>
              ))
            )}

            {/* Total global */}
            <tr className="grand-total">
              <td>{isGlobal ? 'TOTAL GÉNÉRAL' : `TOTAL ${rows[0]?.service ?? ''}`}</td>
              <td className="num">{formatEUR(grandTotal.budgetInitial)}</td>
              <td className="num">{formatEUR(grandTotal.budgetConsomme)}</td>
              <td className="num">{formatEUR(grandTotal.budgetFleche)}</td>
              <td className={resteClass(grandTotal.resteADepenser, true)}>
                {formatEUR(grandTotal.resteADepenser)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
