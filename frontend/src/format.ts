/**
 * Formattage français des montants budgétaires.
 * Arrondi à l'entier supérieur (Math.ceil) appliqué uniquement à l'affichage.
 * Les calculs en amont restent en valeurs brutes.
 */
export function formatEUR(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.ceil(Math.abs(value));
  const sign = value < 0 ? '-' : '';
  return `${sign}${rounded.toLocaleString('fr-FR')} €`;
}

export function formatPercent(ratio: number | null): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(1).replace('.', ',')} %`;
}

export function formatDateFr(d: Date = new Date()): string {
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
