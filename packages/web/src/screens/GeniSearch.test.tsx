import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderGeni, signIn, BURKE } from './geniTestUtil';
import * as geni from '../geni';

const ME = { id: 'profile-9', name: 'Dovy P', years: '1982 – ', url: '' };
const KID = { id: 'profile-10', name: 'Kid P', years: '', url: '' };
const EMPTY_FAMILY = { parents: [], spouses: [], children: [], siblings: [] };

beforeEach(() => {
  signIn();
  vi.spyOn(geni, 'myProfile').mockResolvedValue(ME);
  vi.spyOn(geni, 'immediateFamily').mockResolvedValue({ ...EMPTY_FAMILY, children: [KID] });
});
afterEach(() => vi.restoreAllMocks());

describe('GeniSearch', () => {
  it('disables Next until there is a name, then goes to the results', async () => {
    renderGeni('/geni-search');
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Birth Year'), '1712');
    expect(next).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Add a name');
    await userEvent.type(screen.getByLabelText('Last Names (Surname)'), 'Burke');
    expect(next).toBeEnabled();
    await userEvent.click(next);
    expect(screen.getByTestId('where')).toHaveTextContent('/geni-results');
  });

  it('says Geni searches by name only', () => {
    renderGeni('/geni-search');
    expect(screen.getByText(/Geni searches by name only/)).toBeInTheDocument();
  });

  it('normalizes a pasted geni.com link and rejects pasted junk', async () => {
    renderGeni('/geni-search');
    const box = screen.getByLabelText(/Already know their Geni profile/);
    await userEvent.click(box);
    await userEvent.paste('https://www.geni.com/people/Col-Albert-Smith/6000000085123762838');
    expect(box).toHaveValue('6000000085123762838');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    await userEvent.clear(box);
    await userEvent.type(box, 'Some pasted citation');
    expect(screen.getByRole('alert')).toHaveTextContent('profile-123');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('accepts profile-123 and disables the name fields', async () => {
    renderGeni('/geni-search');
    await userEvent.type(screen.getByLabelText(/Already know their Geni profile/), 'profile-123');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByLabelText('Given Name(s)')).toBeDisabled();
  });

  it('offers Me and family as quick picks that go straight to attach', async () => {
    renderGeni('/geni-search');
    await userEvent.click(await screen.findByRole('button', { name: 'Child: Kid P' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/geni-attach');
    expect(JSON.parse(sessionStorage.getItem('rs_geni_flow') ?? '{}').selected.id).toBe('profile-10');
  });

  it('has a Me pick, loaded before the family call', async () => {
    renderGeni('/geni-search');
    expect(await screen.findByRole('button', { name: 'Me' })).toBeInTheDocument();
    expect(geni.myProfile).toHaveBeenCalledWith('TOK', expect.any(Function));
  });

  it('still works when the quick picks cannot load', async () => {
    vi.spyOn(geni, 'myProfile').mockRejectedValue(new geni.GeniBusyError());
    renderGeni('/geni-search');
    expect(await screen.findByText(/Couldn’t load your family/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Last Names (Surname)'), 'Burke');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('Reset clears the form', async () => {
    renderGeni('/geni-search', { search: { ...geni.emptyCriteria(), surname: 'Burke' } });
    expect(screen.getByLabelText('Last Names (Surname)')).toHaveValue('Burke');
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Last Names (Surname)')).toHaveValue('');
    expect(BURKE.id).toBe('profile-1');
  });
});
