import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackBox } from './FeedbackBox';

describe('FeedbackBox', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens from the link, posts the idea and thanks the user', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<FeedbackBox source="share" />);
    await userEvent.click(screen.getByRole('button', { name: 'Have an idea? Found a bug?' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Bug' }));
    await userEvent.type(screen.getByLabelText('Your idea or bug'), 'Search hangs on Findmypast');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Thanks! We read every one.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/feedback');
    expect(JSON.parse(init.body as string)).toMatchObject({ type: 'bug', message: 'Search hangs on Findmypast', source: 'share' });
  });

  it('keeps the message and explains when sending fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    render(<FeedbackBox source="share" />);
    await userEvent.click(screen.getByRole('button', { name: 'Have an idea? Found a bug?' }));
    await userEvent.type(screen.getByLabelText('Your idea or bug'), 'Add Zotero');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send that");
    expect(screen.getByLabelText('Your idea or bug')).toHaveValue('Add Zotero');
  });

  it('opens in a modal dialog that Escape closes', async () => {
    render(<FeedbackBox source="share" />);
    await userEvent.click(screen.getByRole('button', { name: 'Have an idea? Found a bug?' }));
    const dialog = screen.getByRole('dialog', { name: 'Send us an idea or bug' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Your idea or bug')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Have an idea? Found a bug?' })).toHaveFocus();
  });
});
