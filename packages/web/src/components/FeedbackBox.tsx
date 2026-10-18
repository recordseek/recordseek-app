import { useRef, useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { track } from '../analytics';

/** Public endpoint (Cloud Run function in the `recordseek` project); VITE_FEEDBACK_URL overrides it. */
const DEFAULT_FEEDBACK_URL = 'https://us-central1-recordseek.cloudfunctions.net/feedback';

type Kind = 'idea' | 'bug';
type Status = 'idle' | 'sending' | 'sent' | 'error';

function feedbackUrl(): string {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  return typeof env.VITE_FEEDBACK_URL === 'string' && env.VITE_FEEDBACK_URL
    ? env.VITE_FEEDBACK_URL
    : DEFAULT_FEEDBACK_URL;
}

/** "Have an idea? Found a bug?" — a link that opens a small form in a modal. */
export function FeedbackBox({ source }: { source: 'share' | 'website' }) {
  const [open, setOpen] = useState(false);
  const cta = useRef<HTMLButtonElement>(null);

  function close(): void {
    setOpen(false);
    cta.current?.focus();
  }

  return (
    <>
      <p className="feedback-cta">
        <button ref={cta} type="button" className="link-button" onClick={() => setOpen(true)}>
          Have an idea? Found a bug?
        </button>
      </p>
      {open && <FeedbackDialog source={source} onClose={close} />}
    </>
  );
}

/** The idea/bug form in a modal; also opened from the header's Support item. */
export function FeedbackDialog({ source, onClose }: { source: 'share' | 'website'; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  // Honeypot: hidden from people, filled in by bots.
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const close = onClose;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (message.trim().length < 3 || status === 'sending') return;
    setStatus('sending');
    try {
      const env = import.meta.env as Record<string, string | boolean | undefined>;
      const res = await fetch(feedbackUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: kind,
          message,
          email,
          website,
          source,
          // The hash route only, never the capture query string.
          page: `${window.location.pathname}${window.location.hash.split('?')[0]}`,
          release: typeof env.VITE_RELEASE === 'string' ? env.VITE_RELEASE : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      track('feedback_submitted', { type: kind, source });
      setStatus('sent');
      setMessage('');
    } catch {
      setStatus('error');
    }
  }

  return (
    <Modal title="Send us an idea or bug" onClose={close}>
      {status === 'sent' ? (
        <div role="status">
          <p>Thanks! We read every one.</p>
          <div className="feedback-actions">
            <button type="button" className="btn-sm" onClick={() => setStatus('idle')}>
              Send another
            </button>
            <button type="button" className="primary" onClick={close}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="feedback-kinds" role="radiogroup" aria-label="Type">
            {(['idea', 'bug'] as const).map((k) => (
              <label key={k}>
                <input type="radio" name="feedback-kind" checked={kind === k} onChange={() => setKind(k)} />
                {k === 'idea' ? 'Idea' : 'Bug'}
              </label>
            ))}
          </div>
          <textarea
            aria-label="Your idea or bug"
            placeholder={kind === 'idea' ? 'What would make RecordSeek better?' : 'What went wrong, and on which site?'}
            value={message}
            maxLength={5000}
            rows={3}
            required
            onChange={(e) => setMessage(e.target.value)}
          />
          <input
            type="email"
            aria-label="Email (optional)"
            placeholder="Email (optional, if you'd like a reply)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="feedback-hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          {status === 'error' && <p role="alert">Couldn&apos;t send that. Please try again in a moment.</p>}
          <div className="feedback-actions">
            <button type="button" className="btn-sm" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={status === 'sending' || message.trim().length < 3}>
              {status === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
