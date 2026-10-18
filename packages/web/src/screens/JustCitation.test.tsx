import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CITATION_STYLES } from '@recordseek/core';
import { CaptureProvider } from '../capture/CaptureContext';
import { JustCitation } from './JustCitation';

const HREF =
  'http://localhost:9000/?_=1781642252441&url=https%3A%2F%2Fdp.la%2F' +
  '&title=Digital%20Public%20Library%20of%20America&notes=A%20note';

function renderJustCitation() {
  return render(
    <CaptureProvider href={HREF}>
      <MemoryRouter initialEntries={['/citation']}>
        <Routes>
          <Route path="/citation" element={<JustCitation />} />
          <Route path="/" element={<div>MAIN</div>} />
        </Routes>
      </MemoryRouter>
    </CaptureProvider>,
  );
}

describe('JustCitation', () => {
  it('shows the citation, the source URL, and every style', () => {
    renderJustCitation();
    const citation = screen.getByLabelText('Citation') as HTMLTextAreaElement;
    expect(citation.value).toContain('Digital Public Library of America');
    expect((screen.getByLabelText(/Source \(URL\)/) as HTMLInputElement).value).toBe('https://dp.la/');
    expect(screen.getAllByRole('option')).toHaveLength(CITATION_STYLES.length);
  });

  it('regenerates the citation on style change and persists the choice', async () => {
    renderJustCitation();
    const citation = screen.getByLabelText('Citation') as HTMLTextAreaElement;
    const before = citation.value;
    await userEvent.selectOptions(screen.getByLabelText('Citation format'), 'mla');
    expect(citation.value).not.toBe(before);
    expect(localStorage.getItem('recordseek_source_format')).toBe('mla');
  });

  it('copies the citation to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderJustCitation();
    await userEvent.click(screen.getByRole('button', { name: 'Copy citation' }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('shows the FamilySearch fields: Source Title, Source (URL), then Citation, and no notes', () => {
    renderJustCitation();
    const title = screen.getByLabelText('Source Title');
    const url = screen.getByLabelText(/Source \(URL\)/);
    const citation = screen.getByLabelText('Citation');
    expect(title.compareDocumentPosition(url) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(url.compareDocumentPosition(citation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByLabelText(/Notes/)).not.toBeInTheDocument();
  });

  it('rebuilds the citation when the title or URL is edited', async () => {
    renderJustCitation();
    const citation = screen.getByLabelText('Citation') as HTMLTextAreaElement;
    const title = screen.getByLabelText('Source Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Lithuanian Records');
    expect(citation.value).toContain('Lithuanian Records');
    const url = screen.getByLabelText(/Source \(URL\)/);
    await userEvent.clear(url);
    await userEvent.type(url, 'https://example.org/rec');
    expect(citation.value).toContain('https://example.org/rec');
  });
});
