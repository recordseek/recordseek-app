import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { clearLastService } from '../prefs';
import { isFsAuthenticated, fetchFsUser, logoutFs } from '../fsAuth';
import { FeedbackDialog } from '../components/FeedbackBox';
import { track } from '../analytics';

const WEBSITE_URL = 'https://recordseek.com/';

interface ServiceCrumb {
  name: string;
  icon?: string;
}

/** Map the current route to the service whose flow we're in. */
function serviceForPath(pathname: string): ServiceCrumb | null {
  if (pathname.startsWith('/fs-')) {
    return { name: 'FamilySearch', icon: `${import.meta.env.BASE_URL}images/familysearch-tree.svg` };
  }
  if (pathname.startsWith('/geni')) {
    return { name: 'Geni', icon: `${import.meta.env.BASE_URL}images/geni-logo.svg` };
  }
  if (pathname.startsWith('/a-source')) {
    return { name: 'Ancestry', icon: `${import.meta.env.BASE_URL}images/ancestry-icon.svg` };
  }
  if (pathname.startsWith('/donate')) {
    return { name: 'Donate' };
  }
  if (pathname.startsWith('/citation')) {
    return { name: 'Save to Somewhere Else' };
  }
  return null;
}

/** RecordSeek navbar: clickable brand (back to the picker), a service breadcrumb, and Support/About/Donate. */
export function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const service = serviceForPath(pathname);

  // The signed-in FamilySearch user (only while in the FS flow + authenticated).
  const inFsFlow = pathname.startsWith('/fs-');
  const fsAuthed = inFsFlow && isFsAuthenticated();
  const [userName, setUserName] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (fsAuthed) {
      void fetchFsUser().then((user) => {
        if (active && user) {
          setUserName(user.displayName ?? user.givenName ?? null);
        }
      });
    } else {
      setUserName(null);
    }
    return () => {
      active = false;
    };
  }, [fsAuthed]);

  function goHome(): void {
    // Clear the remembered service so Main shows the picker instead of
    // auto-advancing straight back into a flow.
    clearLastService();
    navigate('/');
  }

  async function logout(): Promise<void> {
    await logoutFs();
    clearLastService();
    setUserName(null);
    navigate('/');
  }

  return (
    <header className="app-header">
      <button type="button" className="brand-link" onClick={goHome} aria-label="RecordSeek home">
        <img className="brand-icon" src={`${import.meta.env.BASE_URL}images/recordseek-icon.svg`} alt="" />
        <span className="brand">
          Record<span className="brand-accent">Seek</span>
        </span>
      </button>
      {service && (
        <>
          <span className="crumb-sep" aria-hidden="true">
            ›
          </span>
          {service.icon ? (
            <img className="crumb-logo" src={service.icon} alt={service.name} />
          ) : (
            <span className="crumb-name">{service.name}</span>
          )}
        </>
      )}
      <nav className="header-menu" aria-label="RecordSeek">
        <button
          type="button"
          onClick={() => {
            track('menu_support');
            setSupportOpen(true);
          }}
        >
          Support
        </button>
        <a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('menu_about')}>
          About
        </a>
        <button type="button" onClick={() => navigate('/donate')}>
          Donate
        </button>
      </nav>
      {fsAuthed && (
        <div className="header-user">
          {userName && <span className="header-hello">Hello {userName}!</span>}
          <button type="button" className="header-logout" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      )}
      {supportOpen && <FeedbackDialog source="share" onClose={() => setSupportOpen(false)} />}
    </header>
  );
}
