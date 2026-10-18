import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { WikiTree } from './WikiTree';

const HREF = 'http://localhost:9000/?_=1781642252441&url=https%3A%2F%2Fdp.la%2F&title=Digital%20Public%20Library%20of%20America';

function renderScreen() {
  return render(
    <CaptureProvider href={HREF}>
      <MemoryRouter initialEntries={['/wikitree']}>
        <Routes>
          <Route path="/wikitree" element={<WikiTree />} />
          <Route path="/" element={<div>MAIN</div>} />
        </Routes>
      </MemoryRouter>
    </CaptureProvider>,
  );
}

describe('WikiTree', () => {
  it('shows a ref block with the wiki link', () => {
    renderScreen();
    const ref = (screen.getByLabelText('Reference') as HTMLTextAreaElement).value;
    expect(ref).toMatch(/^<ref>.*\[https:\/\/dp\.la\/ Digital Public Library of America\]<\/ref>$/);
  });

  it('copies the reference', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Copy reference' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^<ref>/));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('rejects a bad ID and opens the edit page for a good one', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderScreen();
    await userEvent.type(screen.getByLabelText('WikiTree ID'), 'Smith');
    await userEvent.click(screen.getByRole('button', { name: 'Open the edit page' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('WikiTree ID'), '-123');
    await userEvent.click(screen.getByRole('button', { name: 'Open the edit page' }));
    expect(open).toHaveBeenCalledWith('https://www.wikitree.com/index.php?title=Special:EditPerson&w=Smith-123', '_blank', 'noopener');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    open.mockRestore();
  });

  it('goes back to the picker', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /Go Back/ }));
    expect(screen.getByText('MAIN')).toBeInTheDocument();
  });
});
