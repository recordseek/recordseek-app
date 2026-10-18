import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderGeni, signIn, BURKE } from './geniTestUtil';
import { emptyCriteria } from '../geni';

const SPOUSE = { id: 'profile-2', name: 'John Burke', years: '', url: 'https://www.geni.com/people/John/2' };
const doc = (over = {}) => ({
  id: 'document-5',
  url: 'https://www.geni.com/documents/view?doc_id=5',
  tagged: true,
  taggedIds: ['profile-1', 'profile-2'],
  failedIds: [],
  ...over,
});

beforeEach(signIn);
afterEach(() => vi.restoreAllMocks());

describe('GeniComplete', () => {
  it('confirms, links the document and each tagged profile', () => {
    renderGeni('/geni-complete', { saved: { doc: doc(), people: [BURKE, SPOUSE] } });
    expect(screen.getByRole('heading', { name: /Saved to Geni as a document on Elizabeth Burke/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View the document on Geni' })).toHaveAttribute('href', 'https://www.geni.com/documents/view?doc_id=5');
    expect(screen.getByRole('link', { name: 'View John Burke on Geni' })).toBeInTheDocument();
    expect(screen.getByText('“DPLA”')).toBeInTheDocument();
  });

  it('names the people Geni would not tag', () => {
    renderGeni('/geni-complete', { saved: { doc: doc({ tagged: false, taggedIds: ['profile-1'], failedIds: ['profile-2'] }), people: [BURKE, SPOUSE] } });
    expect(screen.getByText(/wouldn’t tag John Burke/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View John Burke on Geni' })).not.toBeInTheDocument();
  });

  it('Save to Another Location returns to the picker', async () => {
    renderGeni('/geni-complete', { saved: { doc: doc(), people: [BURKE] } });
    await userEvent.click(screen.getByRole('button', { name: 'Save to Another Location' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/');
    expect(screen.getByText('MAIN')).toBeInTheDocument();
  });

  it('Go Back returns to the source form with the edits kept', async () => {
    renderGeni('/geni-complete', { saved: { doc: doc(), people: [BURKE] }, search: emptyCriteria() });
    await userEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/geni');
    expect(await screen.findByLabelText('Source Title')).toHaveValue('DPLA');
  });

  it('with nothing saved, goes to the start', () => {
    renderGeni('/geni-complete');
    expect(screen.getByTestId('where')).toHaveTextContent('/geni');
  });
});
