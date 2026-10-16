import { useNavigate } from 'react-router';
import { useCapture } from '../capture/CaptureContext';
import { track } from '../analytics';
import { saveLastService, type Service } from '../prefs';

const ROUTES: Record<Service, string> = {
  FamilySearch: '/fs-source',
  Ancestry: '/a-source',
  Citation: '/citation',
};

export function Main() {
  const navigate = useNavigate();
  const capture = useCapture();
  const captured = capture.title || capture.url;

  // Always show the picker: auto-advancing to the remembered service hid the
  // choice and could drop a user into a sign-in they never asked for.
  function choose(service: Service): void {
    saveLastService(service);
    track('service_selected', { service });
    navigate(ROUTES[service]);
  }

  return (
    <main>
      <h1>Create a Source</h1>
      {captured ? (
        <p>
          For <strong>{capture.title || capture.url}</strong>
          {capture.publisher ? ` · ${capture.publisher}` : ''}
        </p>
      ) : (
        <p>Capture a page with the RecordSeek extension to get started.</p>
      )}
      <p>Where would you like to save this source?</p>

      <div className="service-grid">
        <button type="button" className="service-tile" onClick={() => choose('FamilySearch')}>
          <img src={`${import.meta.env.BASE_URL}images/familysearch-logo.svg`} alt="FamilySearch" />
        </button>
        <button type="button" className="service-tile" onClick={() => choose('Ancestry')}>
          <img src={`${import.meta.env.BASE_URL}images/ancestry-logo.svg`} alt="Ancestry" />
        </button>
        <button type="button" className="service-tile" onClick={() => choose('Citation')}>
          {/* Inline SVG, not an emoji: emoji glyphs are missing on some devices. */}
          <svg
            className="tile-icon"
            viewBox="0 0 24 24"
            width="40"
            height="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8M8 17h8M8 9h2" />
          </svg>
          <span>Save to Somewhere Else</span>
        </button>
      </div>
    </main>
  );
}
