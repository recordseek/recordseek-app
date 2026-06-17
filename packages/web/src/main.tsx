import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Preserve the legacy hashbang contract: the extension appends "#!/fs-source",
// but HashRouter expects "#/fs-source". Normalize once on load.
if (window.location.hash.startsWith('#!/')) {
  window.location.hash = `#${window.location.hash.slice(2)}`;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
