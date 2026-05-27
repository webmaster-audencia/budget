import { memo } from 'react';

interface Props {
  services: string[];
  active: string;
  onChange: (name: string) => void;
}

export const Filters = memo(function Filters({ services, active, onChange }: Props) {
  return (
    <div className="filters no-print">
      <span className="filter-label">Vue</span>
      <button
        type="button"
        className={`filter-btn global ${active === 'Global' ? 'active' : ''}`}
        onClick={() => onChange('Global')}
      >
        Global
      </button>
      {services.map((s) => (
        <button
          key={s}
          type="button"
          className={`filter-btn ${active === s ? 'active' : ''}`}
          onClick={() => onChange(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
});
