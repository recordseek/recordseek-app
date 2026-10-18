import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { useCapture } from "../capture/CaptureContext";
import { track } from "../analytics";
import { saveLastService, type Service } from "../prefs";
import { isDevMode } from "../devFlag";
import { FeedbackBox } from "../components/FeedbackBox";

const ROUTES: Record<Service, string> = {
  FamilySearch: "/fs-source",
  Ancestry: "/a-source",
  Citation: "/citation",
  Zotero: "/zotero",
  Geni: "/geni",
  WikiTree: "/wikitree",
};

const img = (file: string, alt: string, fit = false) => (
  <img
    className={fit ? "logo-fit" : undefined}
    src={`${import.meta.env.BASE_URL}images/${file}`}
    alt={alt}
  />
);

/** Every tile except "Save to Somewhere Else", which always goes last. */
const TILES: {
  service: Service;
  label: string;
  dev?: boolean;
  content: ReactNode;
}[] = [
  {
    service: "Ancestry",
    label: "Ancestry",
    content: img("ancestry-logo.svg", "Ancestry"),
  },
  {
    service: "FamilySearch",
    label: "FamilySearch",
    content: img("familysearch-logo.svg", "FamilySearch"),
  },
  {
    service: "Geni",
    label: "Geni",
    dev: true,
    content: img("geni-logo.svg", "Geni"),
  },
  {
    service: "WikiTree",
    label: "WikiTree",
    dev: true,
    content: img("wikitree-logo.png", "WikiTree"),
  },
  {
    service: "Zotero",
    label: "Zotero",
    dev: true,
    content: img("zotero-logo.svg", "Zotero"),
  },
];

const CITATION_TILE = {
  service: "Citation" as Service,
  label: "Save to Somewhere Else",
  content: (
    <>
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
    </>
  ),
};

export function Main() {
  const navigate = useNavigate();
  const capture = useCapture();
  // Zotero, Geni and WikiTree are hidden in production until `?dev=1` turns them on.
  const dev = isDevMode();
  const tiles = [
    ...TILES.filter((t) => dev || !t.dev).sort((x, y) =>
      x.label.localeCompare(y.label),
    ),
    CITATION_TILE,
  ];
  const captured = capture.title || capture.url;

  // Always show the picker: auto-advancing to the remembered service hid the
  // choice and could drop a user into a sign-in they never asked for.
  function choose(service: Service): void {
    saveLastService(service);
    track("service_selected", { service });
    navigate(ROUTES[service]);
  }

  return (
    <main className="home">
      <h1>Create a Source</h1>
      {captured ? (
        <p>
          For <strong>{capture.title || capture.url}</strong>
          {capture.publisher ? ` · ${capture.publisher}` : ""}
        </p>
      ) : (
        <p>Capture a page with the RecordSeek extension to get started.</p>
      )}
      <p>Where would you like to save this source?</p>

      <div className="service-grid">
        {tiles.map((t) => (
          <button
            key={t.service}
            type="button"
            className="service-tile"
            onClick={() => choose(t.service)}
          >
            {t.content}
          </button>
        ))}
      </div>

      <FeedbackBox source="share" />
    </main>
  );
}
