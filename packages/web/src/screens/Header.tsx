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
  /** Recolor a dark/colored logo white so it reads on the dark navbar. */
  white?: boolean;
}

/** Map the current route to the service whose flow we're in. */
function serviceForPath(pathname: string): ServiceCrumb | null {
  if (pathname.startsWith('/fs-')) {
    return { name: 'FamilySearch', icon: `${import.meta.env.BASE_URL}images/familysearch-tree.svg` };
  }
  if (pathname.startsWith('/geni')) {
    return { name: 'Geni', icon: `${import.meta.env.BASE_URL}images/geni-logo.svg`, white: true };
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

/** RecordSeek navbar: clickable brand (back to the picker), a service breadcrumb, and About/Donate/Help. */
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
            <img
              className={service.white ? 'crumb-logo crumb-logo-white' : 'crumb-logo'}
              src={service.icon}
              alt={service.name}
            />
          ) : (
            <span className="crumb-name">{service.name}</span>
          )}
        </>
      )}
      <nav className="header-menu" aria-label="RecordSeek">
        <a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('menu_about')}>
          <MenuIcon name="about" />
          About
        </a>
        <button type="button" onClick={() => navigate('/donate')}>
          <MenuIcon name="donate" />
          Donate
        </button>
        <button
          type="button"
          onClick={() => {
            track('menu_help');
            setSupportOpen(true);
          }}
        >
          <MenuIcon name="help" />
          Help
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

/** Inline line icons (Lucide shapes) for the header menu: graduation cap, heart, life ring. */
function MenuIcon({ name }: { name: 'about' | 'donate' | 'help' }) {
  return (
    <svg
      className="menu-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'about' && (
        <>
          <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
          <path d="M22 10v6" />
          <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
        </>
      )}
      {name === 'donate' && (
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      )}
      {name === 'help' && (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="m4.93 4.93 4.24 4.24" />
          <path d="m14.83 9.17 4.24-4.24" />
          <path d="m14.83 14.83 4.24 4.24" />
          <path d="m9.17 14.83-4.24 4.24" />
          <circle cx="12" cy="12" r="4" />
        </>
      )}
    </svg>
  );
}
