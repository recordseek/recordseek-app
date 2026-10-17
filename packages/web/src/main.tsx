import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initSentry, ErrorBoundary } from './sentry';
import { initAnalytics } from './analytics';
import './styles.css';

// Preserve the legacy hashbang contract: the extension appends "#!/fs-source",
// but HashRouter expects "#/fs-source". Normalize once on load.
if (window.location.hash.startsWith('#!/')) {
  window.location.hash = `#${window.location.hash.slice(2)}`;
}

initSentry();
initAnalytics();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary
        fallback={
          <main>
            <h3>Something went wrong</h3>
            <p role="alert">RecordSeek hit an unexpected problem. We’ve been notified.</p>
            <button type="button" className="primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </main>
        }
      >
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
