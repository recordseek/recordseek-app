import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CITATION_STYLES } from '@recordseek/core';
import { CaptureProvider } from '../capture/CaptureContext';
import { ASource } from './ASource';

const HREF =
  'http://localhost:9000/?url=https%3A%2F%2Fwww.ancestry.com%2Frecord%2F1&title=Jane%20Doe%20-%20Ancestry.com&notes=a%20note';

function renderASource() {
  return render(
    <MemoryRouter>
      <CaptureProvider href={HREF}>
        <ASource />
      </CaptureProvider>
    </MemoryRouter>,
  );
}

describe('ASource', () => {
  it('natively posts the capture to Ancestry', () => {
    renderASource();
    const form = document.querySelector('form');
    expect(form?.getAttribute('action')).toBe('https://www.ancestry.com/savetoancestry/');
    expect(form?.getAttribute('method')?.toLowerCase()).toBe('post');
    expect((document.querySelector('input[name="sourceTitle"]') as HTMLInputElement).value).toBe('Jane Doe');
    expect((document.querySelector('input[name="citationUrl"]') as HTMLInputElement).value).toContain(
      'ancestry.com/record/1',
    );
    expect((document.querySelector('input[name="repositoryDomain"]') as HTMLInputElement).value).toBe('Ancestry.com');
  });

  it('offers every citation style and regenerates the citation on change', async () => {
    renderASource();
    expect(screen.getAllByRole('option')).toHaveLength(CITATION_STYLES.length);
    const citation = document.querySelector('textarea[name="citationTitle"]') as HTMLTextAreaElement;
    const before = citation.value;
    await userEvent.selectOptions(screen.getByLabelText('Citation format'), 'mla');
    expect(citation.value).not.toBe(before);
    expect(citation.value).toContain('"Jane Doe."');
  });
});
