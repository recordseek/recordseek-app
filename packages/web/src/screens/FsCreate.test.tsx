import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider, useSession, type SessionState } from '../session/SessionContext';
import { FsCreate, type FsCreateClient } from './FsCreate';

function makeClient(overrides: Partial<FsCreateClient> = {}) {
  const calls: {
    personSourceRef: Array<{ pid: string; ref: { descriptionUrl: string; tags?: string[]; changeMessage?: string } }>;
    createPerson: unknown[];
  } = { personSourceRef: [], createPerson: [] };
  const client: FsCreateClient = {
    apiHost: 'https://api.familysearch.org',
    descriptionUrl: (id) => `https://api.familysearch.org/platform/sources/descriptions/${id}`,
    createSourceDescription: async () => 'SD-1',
    getCurrentUser: async () => ({ id: 'U1' }),
    getUserCollections: async () => [],
    createCollection: async () => ({
      headers: new Headers({ location: 'https://api.familysearch.org/platform/sources/collections/C1' }),
    }),
    addDescriptionToCollection: async () => ({}),
    createPersonSourceRef: async (pid, ref) => {
      calls.personSourceRef.push({ pid, ref });
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
          <Route path="/fs-create" element={<FsCreate client={client} />} />
          <Route path="/fs-complete" element={<CompleteProbe />} />
          <Route path="/fs-source" element={<div>SOURCE</div>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

const DRAFT = { url: 'https://x.com/record', title: 'A Record', citation: 'A citation.', notes: 'notes' };
const ATTACH = { pid: 'P1', name: 'John Smith', url: 'http://fs/P1', justification: 'census match' };
const TAGS = { name: false, gender: false, birth: true, christening: false, death: false, burial: false };

describe('FsCreate', () => {
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

  it('surfaces the real error when source creation fails', async () => {
    const { client } = makeClient({
      createSourceDescription: async () => {
        throw new Error('FamilySearch API 403: forbidden');
      },
    });
    renderCreate(client, { draft: DRAFT, attach: ATTACH });
    expect(await screen.findByRole('alert')).toHaveTextContent('forbidden');
  });

  it('redirects to fs-source when there is no draft', async () => {
    const { client } = makeClient();
    renderCreate(client, { draft: null, attach: ATTACH });
    expect(await screen.findByText('SOURCE')).toBeInTheDocument();
  });
});
