import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { Ancestry2 } from './Ancestry2';
import { companionRequest } from '../ancestry2/browser-transport.mjs';

vi.mock('../ancestry2/browser-transport.mjs', () => ({
  companionRequest: vi.fn(),
}));

const request = vi.mocked(companionRequest);
const HREF = 'http://localhost:9000/?url=https%3A%2F%2Fdp.la%2Fitem%2F1&title=Digital%20Public%20Library&notes=Captured%20note';
const CONNECTED = { connected: true, context: { userId: 'user', treeId: 'tree', personId: 'person', personName: 'Jane Doe' } };

function renderAncestry2() {
  return render(
    <MemoryRouter>
      <CaptureProvider href={HREF}><Ancestry2 /></CaptureProvider>
    </MemoryRouter>,
  );
}

describe('Ancestry2', () => {
  beforeEach(() => {
    request.mockReset();
    sessionStorage.clear();
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' });
  });

  it('uses the connected person target and gates a malformed captured URL', async () => {
    request.mockResolvedValue(CONNECTED);
    renderAncestry2();
    await screen.findByText('Connected to Jane Doe.');
    const save = screen.getByRole('button', { name: 'Save to displayed person' });
    expect(save).toBeEnabled();
    await userEvent.clear(screen.getByLabelText(/Source \(URL\)/));
    await userEvent.type(screen.getByLabelText(/Source \(URL\)/), 'javascript:bad');
    expect(save).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('http(s)');
  });

  it('sends the displayed target and reports only an acknowledged success', async () => {
    request.mockResolvedValueOnce(CONNECTED).mockResolvedValueOnce({
      state: 'complete',
      result: { ok: true, verified: true, sourceId: 'source-1', citationId: 'citation-1' },
    });
    renderAncestry2();
    await screen.findByText('Connected to Jane Doe.');
    await userEvent.click(screen.getByRole('button', { name: 'Save to displayed person' }));
    await waitFor(() => expect(request).toHaveBeenLastCalledWith(
      'save',
      expect.objectContaining({ target: { treeId: 'tree', personId: 'person' } }),
      { requestId: 'request-1' },
    ));
    expect(screen.getByText('Save verified by Ancestry. Check the person before starting another save.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I checked Ancestry; start a new save' })).toBeInTheDocument();
  });

  it('does not blindly repeat an unknown or failed save', async () => {
    request.mockResolvedValueOnce(CONNECTED).mockRejectedValueOnce(new Error('Save outcome unknown. Check Ancestry.'));
    renderAncestry2();
    await screen.findByText('Connected to Jane Doe.');
    await userEvent.click(screen.getByRole('button', { name: 'Save to displayed person' }));
    await screen.findByText('Save outcome unknown. Check Ancestry.');
    expect(screen.queryByRole('button', { name: 'Save to displayed person' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check last save' })).toBeInTheDocument();
  });

  it('recovers a persisted job only when the user checks it', async () => {
    sessionStorage.setItem('recordseek-ancestry2-last-job', JSON.stringify({ jobId: 'prior-job' }));
    request.mockResolvedValue(CONNECTED);
    renderAncestry2();
    await screen.findByText('Connected to Jane Doe.');
    expect(request).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Check last save' }));
    expect(request).toHaveBeenLastCalledWith('job', { jobId: 'prior-job' });
  });
  it('keeps saving disabled without a connected person', async () => {
    request.mockResolvedValue({ connected: false });
    renderAncestry2();
    await screen.findByText(/Open a signed-in Ancestry person tab/);
    expect(screen.getByRole('button', { name: 'Save to displayed person' })).toBeDisabled();
  });

  it('preserves partial IDs without announcing success or retrying', async () => {
    request.mockResolvedValueOnce(CONNECTED).mockResolvedValueOnce({
      state: 'complete', result: { ok: false, mayHaveWritten: true, sourceId: 'partial-source', message: 'Citation failed. Inspect Ancestry.' },
    });
    renderAncestry2();
    await screen.findByText('Connected to Jane Doe.');
    await userEvent.click(screen.getByRole('button', { name: 'Save to displayed person' }));
    await screen.findByText('Citation failed. Inspect Ancestry.');
    expect(screen.getByText(/partial-source/)).toBeInTheDocument();
    expect(screen.queryByText(/Save verified by Ancestry/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save to displayed person' })).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('sends no write when the recovery journal cannot be stored', async () => {
    request.mockResolvedValue(CONNECTED);
    renderAncestry2();
    await screen.findByText('Connected to Jane Doe.');
    const store = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    await userEvent.click(screen.getByRole('button', { name: 'Save to displayed person' }));
    await screen.findByText(/no write was sent/);
    expect(request).toHaveBeenCalledTimes(1);
    store.mockRestore();
  });

});
