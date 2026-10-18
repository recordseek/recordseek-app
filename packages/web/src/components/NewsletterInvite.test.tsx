import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../devFlag', () => ({ isDevMode: vi.fn(() => true) }));
vi.mock('../newsletter', async (orig) => ({
  ...(await orig<typeof import('../newsletter')>()),
  signedInAccountHashes: vi.fn(async () => ['zotero_' + 'a'.repeat(32)]),
}));
import { isDevMode } from '../devFlag';
import { NewsletterInvite } from './NewsletterInvite';

function stubFetch(subscribed: boolean, subscribeStatus = 201) {
  const fn = vi.fn(async (url: string) =>
    String(url).includes('action=status')
      ? new Response(JSON.stringify({ subscribed }), { status: 200 })
      : new Response('{"ok":true}', { status: subscribeStatus }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('NewsletterInvite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isDevMode).mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders nothing outside dev mode', () => {
    vi.mocked(isDevMode).mockReturnValue(false);
    const fetchMock = stubFetch(false);
    const { container } = render(<NewsletterInvite source="fs" />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders nothing when this browser already subscribed', () => {
    localStorage.setItem('rs_newsletter', 'subscribed');
    const { container } = render(<NewsletterInvite source="fs" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides and remembers when the server says an account is subscribed', async () => {
    const fetchMock = stubFetch(true);
    const { container } = render(<NewsletterInvite source="fs" />);
    await waitFor(() => expect(localStorage.getItem('rs_newsletter')).toBe('subscribed'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('posts the email and account hashes, then thanks the user', async () => {
    const fetchMock = stubFetch(false);
    render(<NewsletterInvite source="zotero" />);
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByText("Thanks! You're on the list.")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toContain('action=subscribe');
    expect(JSON.parse(init.body as string)).toMatchObject({
      email: 'a@b.co',
      accounts: ['zotero_' + 'a'.repeat(32)],
      source: 'zotero',
    });
    expect(localStorage.getItem('rs_newsletter')).toBe('subscribed');
  });

  it('shows an alert when subscribing fails', async () => {
    stubFetch(false, 500);
    render(<NewsletterInvite source="fs" />);
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't subscribe right now");
  });

  it('remembers a dismissal', async () => {
    stubFetch(false);
    const { container } = render(<NewsletterInvite source="fs" />);
    await userEvent.click(await screen.findByRole('button', { name: 'No thanks' }));
    expect(localStorage.getItem('rs_newsletter')).toBe('dismissed');
    expect(container).toBeEmptyDOMElement();
  });
});
