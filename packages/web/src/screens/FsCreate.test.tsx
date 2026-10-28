import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { SessionProvider, useSession, type SessionState } from '../session/SessionContext';
import { FsApiError } from '@recordseek/core';
import { FsCreate, aboutShape, type FsCreateClient } from './FsCreate';

const sentry = vi.hoisted(() => ({ reportError: vi.fn(), reportWarning: vi.fn() }));
vi.mock('../sentry', () => sentry);

function makeClient(overrides: Partial<FsCreateClient> = {}) {
  const calls: {
    personSourceRef: Array<{ pid: string; ref: { descriptionUrl: string; tags?: string[]; changeMessage?: string } }>;
    coupleSourceRef: Array<{ coupleId: string; ref: { descriptionUrl: string; tags?: string[]; changeMessage?: string } }>;
    createPerson: unknown[];
  } = { personSourceRef: [], coupleSourceRef: [], createPerson: [] };
  const client: FsCreateClient = {
    descriptionUrl: (id) => `https://api.familysearch.org/platform/sources/descriptions/${id}`,
    createSourceDescription: async () => 'SD-1',
    createPersonSourceRef: async (pid, ref) => {
      calls.personSourceRef.push({ pid, ref });
      return {};
    },
    createCoupleSourceRef: async (coupleId, ref) => {
      calls.coupleSourceRef.push({ coupleId, ref });
      return {};
    },
    createPerson: async (person) => {
      calls.createPerson.push(person);
      return 'NEW-PID';
    },
    ...overrides,
  };
  return { client, calls };
}

function CompleteProbe() {
  const { state } = useSession();
  const c = state.complete;
  return <div>DONE {c === 'noAttachment' ? 'noAttachment' : c ? c.name : 'none'}</div>;
}

function renderCreate(client: FsCreateClient, initial: Partial<SessionState>) {
  return render(
    <SessionProvider initial={initial}>
      <MemoryRouter initialEntries={['/fs-create']}>
        <Routes>
          <Route path="/fs-create" element={<FsCreate client={client} retryDelayMs={0} />} />
          <Route path="/fs-complete" element={<CompleteProbe />} />
          <Route path="/fs-source" element={<div>SOURCE</div>} />
          <Route path="/fs-attach" element={<div>ATTACH SCREEN</div>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

const DRAFT = { url: 'https://x.com/record', title: 'A Record', citation: 'A citation.', notes: 'notes' };
const ATTACH = { pid: 'P1', name: 'John Smith', url: 'http://fs/P1', justification: 'census match' };
const TAGS = { name: false, gender: false, birth: true, christening: false, death: false, burial: false, marriage: false };

describe('FsCreate', () => {
  afterEach(() => localStorage.clear());

  it('runs create -> file -> attach and lands on complete', async () => {
    const { client, calls } = makeClient();
    renderCreate(client, { draft: DRAFT, attach: ATTACH, tags: TAGS });
    expect(await screen.findByText('DONE John Smith')).toBeInTheDocument();
    expect(calls.personSourceRef).toHaveLength(1);
    expect(calls.personSourceRef[0]!.pid).toBe('P1');
    expect(calls.personSourceRef[0]!.ref.descriptionUrl).toBe(
      'https://api.familysearch.org/platform/sources/descriptions/SD-1',
    );
    expect(calls.personSourceRef[0]!.ref.tags).toEqual(['http://gedcomx.org/Birth']);
    expect(calls.personSourceRef[0]!.ref.changeMessage).toBe('census match');
  });

  // The couple source-reference write is temporarily disabled (MARRIAGE_WRITE_ENABLED
  // = false) pending FS beta-sandbox verification of the payload. Until then the
  // person source still attaches and no couple write fires, even when Marriage is
  // selected. Flip this test back to expecting a coupleSourceRef call on re-enable.
  it('does not write the Marriage couple source while the write is disabled', async () => {
    const { client, calls } = makeClient();
    renderCreate(client, {
      draft: DRAFT,
      attach: { ...ATTACH, coupleId: 'CR-9', spouseName: 'Jane Smith' },
      tags: { ...TAGS, marriage: true },
    });
    expect(await screen.findByText('DONE John Smith')).toBeInTheDocument();
    expect(calls.personSourceRef).toHaveLength(1);
    expect(calls.coupleSourceRef).toHaveLength(0);
  });

  it('skips the Marriage attach when no couple was chosen', async () => {
    const { client, calls } = makeClient();
    renderCreate(client, { draft: DRAFT, attach: ATTACH, tags: { ...TAGS, marriage: true } });
    expect(await screen.findByText('DONE John Smith')).toBeInTheDocument();
    expect(calls.coupleSourceRef).toHaveLength(0);
  });

  it('still completes when the optional Marriage attach fails', async () => {
    const { client, calls } = makeClient({
      createCoupleSourceRef: async () => {
        throw Object.assign(new Error('FamilySearch API 403'), { status: 403 });
      },
    });
    renderCreate(client, {
      draft: DRAFT,
      attach: { ...ATTACH, coupleId: 'CR-9' },
      tags: { ...TAGS, marriage: true },
    });
    expect(await screen.findByText('DONE John Smith')).toBeInTheDocument();
    expect(calls.personSourceRef).toHaveLength(1);
  });

  it('creates and attaches without moving the source into a folder', async () => {
    // A created source description already lands in the source box under Home
    // (Unorganized); the pipeline no longer moves it into a hidden folder.
    const { client, calls } = makeClient();
    renderCreate(client, { draft: DRAFT, attach: ATTACH, tags: TAGS });
    expect(await screen.findByText('DONE John Smith')).toBeInTheDocument();
    expect(calls.personSourceRef).toHaveLength(1);
  });

  it('saves without attaching when complete is noAttachment', async () => {
    const { client, calls } = makeClient();
    renderCreate(client, { draft: DRAFT, attach: null, complete: 'noAttachment' });
    expect(await screen.findByText('DONE noAttachment')).toBeInTheDocument();
    expect(calls.personSourceRef).toHaveLength(0);
  });

  it('creates a brand-new person then attaches in the new-person branch', async () => {
    const { client, calls } = makeClient();
    renderCreate(client, {
      draft: DRAFT,
      attach: null,
      newPerson: {
        givenName: 'Jane',
        surname: 'Doe',
        gender: 'Female',
        living: false,
        birthDate: '1800',
        birthPlace: '',
        deathDate: '',
        deathPlace: '',
      },
      tags: TAGS,
    });
    expect(await screen.findByText('DONE Jane Doe')).toBeInTheDocument();
    expect(calls.createPerson).toHaveLength(1);
    expect(calls.personSourceRef[0]!.pid).toBe('NEW-PID');
  });

  it('attaches to the picked person even when a new-person draft is left over', async () => {
    const { client, calls } = makeClient();
    renderCreate(client, {
      draft: DRAFT,
      attach: ATTACH,
      newPerson: {
        givenName: '',
        surname: '',
        gender: 'Unknown',
        living: false,
        birthDate: '',
        birthPlace: '',
        deathDate: '',
        deathPlace: '',
      },
      tags: TAGS,
    });
    expect(await screen.findByText('DONE John Smith')).toBeInTheDocument();
    expect(calls.createPerson).toHaveLength(0);
    expect(calls.personSourceRef[0]!.pid).toBe('P1');
  });

  it('reports a warning, not an error, when the source saved only with a simpler link', async () => {
    sentry.reportWarning.mockClear();
    sentry.reportError.mockClear();
    const { client } = makeClient({
      createSourceDescription: async (_draft, options) => {
        options?.onAboutFallback?.({ rung: 'path', attempts: 3, status: 400 });
        return 'SD-1';
      },
    });
    renderCreate(client, { draft: { ...DRAFT, url: 'https://x.com/record?id=1' }, attach: ATTACH, tags: TAGS });
    expect(await screen.findByText('DONE John Smith')).toBeInTheDocument();
    expect(sentry.reportError).not.toHaveBeenCalled();
    expect(sentry.reportWarning).toHaveBeenCalledTimes(1);
    const extra = sentry.reportWarning.mock.calls[0]![1];
    expect(extra).toMatchObject({ rung: 'path', attempts: 3, urlHost: 'x.com', urlQueryLength: 5 });
    expect(JSON.stringify(extra)).not.toContain('record');
  });

  it('does not repeat the link ladder after a create_source 400', async () => {
    let createCalls = 0;
    const { client } = makeClient({
      createSourceDescription: async () => {
        createCalls += 1;
        throw new FsApiError(400, '{}', 'FamilySearch API 400: Failure in upstream call: Unable to create source');
      },
    });
    renderCreate(client, { draft: DRAFT, attach: ATTACH });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(createCalls).toBe(1);
  });

  it('aboutShape describes a link without its path or query', () => {
    expect(aboutShape(' https://www.example.org/a/b?q=secret#h ')).toEqual({
      urlScheme: 'https',
      urlLength: 38,
      urlUnsafeChars: false,
      urlHost: 'www.example.org',
      urlPathLength: 4,
      urlQueryLength: 9,
      urlHashLength: 2,
    });
    expect(aboutShape('not a url')).toMatchObject({ urlParses: false, urlUnsafeChars: true });
  });

  it('surfaces the real error when source creation fails', async () => {
    const { client } = makeClient({
      createSourceDescription: async () => {
        throw new Error('FamilySearch API 403: forbidden');
      },
    });
    renderCreate(client, { draft: DRAFT, attach: ATTACH });
    expect(await screen.findByRole('alert')).toHaveTextContent('forbidden');
  });

  it('explains a merged or deleted person instead of the raw 410', async () => {
    const { client } = makeClient({
      createPersonSourceRef: async () => {
        throw Object.assign(new Error('FamilySearch API 410: Failure in upstream call'), { status: 410 });
      },
    });
    renderCreate(client, { draft: DRAFT, attach: ATTACH, tags: TAGS });
    expect(await screen.findByRole('alert')).toHaveTextContent('merged or deleted');
  });

  it('explains an attach permission 403 and does not retry', async () => {
    let attachCalls = 0;
    const { client } = makeClient({
      createPersonSourceRef: async () => {
        attachCalls += 1;
        throw Object.assign(new Error('FamilySearch API 403: Failure in upstream call'), { status: 403 });
      },
    });
    renderCreate(client, { draft: DRAFT, attach: ATTACH, tags: TAGS });
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission to edit/i);
    expect(attachCalls).toBe(1);
  });

  it('retries a failed step once without re-creating the source', async () => {
    let createCalls = 0;
    let attachCalls = 0;
    const { client } = makeClient({
      createSourceDescription: async () => {
        createCalls += 1;
        return 'SD-1';
      },
      createPersonSourceRef: async () => {
        attachCalls += 1;
        if (attachCalls === 1) throw Object.assign(new Error('FamilySearch API 503'), { status: 503 });
        return {};
      },
    });
    renderCreate(client, { draft: DRAFT, attach: ATTACH, tags: TAGS });
    expect(await screen.findByText('DONE John Smith')).toBeInTheDocument();
    expect(createCalls).toBe(1);
    expect(attachCalls).toBe(2);
  });

  it('after a failed retry, says what was saved and offers Go Back', async () => {
    let attachCalls = 0;
    const { client } = makeClient({
      createPersonSourceRef: async () => {
        attachCalls += 1;
        throw Object.assign(new Error('FamilySearch API 503'), { status: 503 });
      },
    });
    renderCreate(client, { draft: DRAFT, attach: ATTACH, tags: TAGS });
    expect(await screen.findByRole('alert')).toHaveTextContent('FamilySearch is having trouble');
    expect(attachCalls).toBe(2);
    expect(screen.getByText(/Your source was saved to your FamilySearch source box/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Go Back/ }));
    expect(await screen.findByText('ATTACH SCREEN')).toBeInTheDocument();
  });

  it('does not create the new person twice when the attach is retried', async () => {
    let attachCalls = 0;
    const { client, calls } = makeClient({
      createPersonSourceRef: async () => {
        attachCalls += 1;
        if (attachCalls === 1) throw new Error('flaky');
        return {};
      },
    });
    renderCreate(client, {
      draft: DRAFT,
      attach: null,
      newPerson: {
        givenName: 'Jane',
        surname: 'Doe',
        gender: 'Female',
        living: false,
        birthDate: '',
        birthPlace: '',
        deathDate: '',
        deathPlace: '',
      },
      tags: TAGS,
    });
    expect(await screen.findByText('DONE Jane Doe')).toBeInTheDocument();
    expect(calls.createPerson).toHaveLength(1);
  });

  it('redirects to fs-source when there is no draft', async () => {
    const { client } = makeClient();
    renderCreate(client, { draft: null, attach: ATTACH });
    expect(await screen.findByText('SOURCE')).toBeInTheDocument();
  });
});
