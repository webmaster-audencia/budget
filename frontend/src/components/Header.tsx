import { memo, useState } from 'react';
import { formatDateFr } from '../format';

export const Header = memo(function Header() {
  const [logoOk, setLogoOk] = useState(true);

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          {logoOk ? (
            <img
              src="/logo-audencia.svg"
              alt="Audencia"
              className="brand-logo"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <div className="brand-logo-slot" aria-hidden="true">A</div>
          )}
          <div className="brand-text">
            <div className="brand-name">Audencia</div>
            <div className="brand-signature">Change. Your way.</div>
          </div>
        </div>

        <div className="header-center">
          <div className="header-title">Suivi budgétaire marketing</div>
        </div>

        <div className="header-right">
          <div className="header-date">{formatDateFr()}</div>
        </div>
      </div>
    </header>
  );
});
