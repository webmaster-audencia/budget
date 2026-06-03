import { memo, useState } from 'react';
import { formatDateFr } from '../format';

export const Header = memo(function Header() {
  const [logoOk, setLogoOk] = useState(true);

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          {logoOk ? (
            // Logo servi depuis frontend/public/logo-audencia.JPG → URL « /logo-audencia.JPG ».
            // Casse exacte requise (Linux/serveur Vite). Fallback texte si l'image ne charge pas.
            <img
              src="/logo-audencia.JPG"
              alt="Audencia"
              className="brand-logo"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <div className="brand-logo-slot" aria-hidden="true">Audencia</div>
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
