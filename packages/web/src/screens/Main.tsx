import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCapture } from '../capture/CaptureContext';
import { getLastService, saveLastService, type Service } from '../prefs';

const ROUTES: Record<Service, string> = {
  FamilySearch: '/fs-source',
  Ancestry: '/a-source',
  Citation: '/citation',
};

export function Main() {
  const navigate = useNavigate();
  const capture = useCapture();
  const captured = capture.title || capture.url;

  // Legacy parity: jump straight to the remembered service so a returning user
  // needs no extra click. (Going Back to Main clears the memory.)
  useEffect(() => {
    const last = getLastService();
    if (last) {
      navigate(ROUTES[last], { replace: true });
    }
  }, [navigate]);

  function choose(service: Service): void {
    saveLastService(service);
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
          <span className="tile-icon" aria-hidden="true">
            📋
          </span>
          <span>Save to Somewhere Else</span>
        </button>
      </div>
    </main>
  );
}
