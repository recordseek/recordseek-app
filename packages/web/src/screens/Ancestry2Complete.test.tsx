import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Ancestry2Complete } from './Ancestry2Complete';

const navigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
const track = vi.fn();
vi.mock('../analytics', () => ({ track: (...a: unknown[]) => track(...a) }));

function seed(saved: unknown) {
  sessionStorage.setItem('rs_ancestry2_flow', JSON.stringify({ saved, source: { title: 'A census', url: '', citation: '', notes: '' } }));
}

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('Ancestry2Complete', () => {
  it('redirects back to the form when nothing was saved', () => {
    const { container } = render(<Ancestry2Complete />);
    expect(navigate).toHaveBeenCalledWith('/ancestry2', { replace: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('confirms the save with a link to the person on Ancestry', () => {
    seed({ personName: 'Ada Lovelace', personUrl: 'https://www.ancestry.com/family-tree/person/tree/1/person/2/facts' });
    render(<Ancestry2Complete />);
    expect(screen.getByRole('heading', { name: /Saved to Ancestry on Ada Lovelace/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Ada Lovelace on Ancestry' })).toHaveAttribute(
      'href',
      'https://www.ancestry.com/family-tree/person/tree/1/person/2/facts',
    );
    expect(track).toHaveBeenCalledWith('ancestry2_completed');
  });
});
