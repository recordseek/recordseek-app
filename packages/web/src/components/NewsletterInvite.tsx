import { useEffect, useRef, useState, type FormEvent } from 'react';
import { track } from '../analytics';
import { isDevMode } from '../devFlag';
import {
  getNewsletterState,
  isSubscribed,
  setNewsletterState,
  signedInAccountHashes,
  subscribe,
} from '../newsletter';

type Phase = 'checking' | 'hidden' | 'form' | 'sending' | 'error' | 'done';

/**
 * Opt-in "Get RecordSeek updates" box shown after a save. Dev mode only. Hidden
 * once subscribed or dismissed, or when a signed-in account is already on the list.
 */
export function NewsletterInvite({ source }: { source: string }) {
  const dev = isDevMode();
  const [phase, setPhase] = useState<Phase>(dev && !getNewsletterState() ? 'checking' : 'hidden');
  const [email, setEmail] = useState('');
  // Honeypot: hidden from people, filled in by bots.
  const [website, setWebsite] = useState('');
  const accounts = useRef<string[]>([]);

  useEffect(() => {
    if (phase !== 'checking') return;
    let active = true;
    (async () => {
      accounts.current = await signedInAccountHashes();
      const already = await isSubscribed(accounts.current);
      if (!active) return;
      if (already) {
        setNewsletterState('subscribed');
        setPhase('hidden');
      } else {
        track('newsletter_shown', { source });
        setPhase('form');
      }
    })();
    return () => {
      active = false;
    };
  }, [phase, source]);

  if (phase === 'hidden' || phase === 'checking') return null;

  if (phase === 'done') {
    return (
      <div className="newsletter-invite">
        <p>Thanks! You&apos;re on the list.</p>
      </div>
    );
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (phase === 'sending' || !email.trim()) return;
    setPhase('sending');
    try {
      await subscribe(email.trim(), accounts.current, source, website);
      setNewsletterState('subscribed');
      track('newsletter_subscribed', { source });
      setPhase('done');
    } catch {
      setPhase('error');
    }
  }

  function dismiss(): void {
    setNewsletterState('dismissed');
    track('newsletter_dismissed', { source });
    setPhase('hidden');
  }

  return (
    <div className="newsletter-invite">
      <h3>Get RecordSeek updates</h3>
      <p>New save destinations and features as they launch. No spam; unsubscribe anytime.</p>
      <form onSubmit={submit}>
        <input
          type="email"
          aria-label="Email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="newsletter-hp"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        <button type="submit" className="primary" disabled={phase === 'sending'}>
          Subscribe
        </button>
        <button type="button" className="link-button" onClick={dismiss}>
          No thanks
        </button>
      </form>
      {phase === 'error' && <p role="alert">Couldn&apos;t subscribe right now. Please try again.</p>}
    </div>
  );
}
