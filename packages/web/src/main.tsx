import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initSentry, ErrorBoundary } from './sentry';
import './styles.css';

// Preserve the legacy hashbang contract: the extension appends "#!/fs-source",
// but HashRouter expects "#/fs-source". Normalize once on load.
if (window.location.hash.startsWith('#!/')) {
  window.location.hash = `#${window.location.hash.slice(2)}`;
}

initSentry();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary fallback={<p role="alert">Something went wrong. Please reload the page.</p>}>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
