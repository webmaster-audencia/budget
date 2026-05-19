import { formatDateFr } from '../format';

export function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <div className="brand-logo" aria-label="Audencia">A</div>
          <div className="brand-text">
            <div className="brand-name">Audencia</div>
            <div className="brand-tag">Direction Communication & Marketing</div>
          </div>
        </div>
        <div className="header-right">
          <div className="header-title">Suivi budgétaire marketing</div>
          <div className="header-date">{formatDateFr()}</div>
        </div>
      </div>
    </header>
  );
}
