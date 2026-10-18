import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { SessionProvider, useSession, emptySearch, type SearchCriteria } from '../session/SessionContext';
import { FsResults, buildSearchQuery, pageWindow, type FsResultsClient } from './FsResults';

// FsResults re-authenticates via fsAuth; stub the redirect and treat a 401-tagged
// error as an auth error (mirrors the real isFsAuthError(FsApiError 401)).
const { beginFsLogin } = vi.hoisted(() => ({ beginFsLogin: vi.fn(() => Promise.resolve()) }));
vi.mock('../fsAuth', () => ({
  beginFsLogin,
  isFsAuthError: (e: unknown) =>
    typeof e === 'object' && e !== null && (e as { status?: number }).status === 401,
}));

function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

const PERSON = {
  id: 'PRIM-ARY1',
  display: { name: 'John Smith', gender: 'Male', lifespan: '1850–1910', birthDate: '1850', birthPlace: 'Ohio' },
};
const FEED = {
  entries: [{ id: 'PRIM-ARY1', score: 3, content: { gedcomx: { persons: [PERSON], relationships: [] } } }],
};

function AttachProbe() {
  const { state } = useSession();
  return <div>ATTACH:{state.attach?.name ?? 'none'}</div>;
}

function renderResults(client: FsResultsClient, initialSearch: Partial<SearchCriteria> = {}) {
  return render(
    <SessionProvider initial={{ search: { ...emptySearch(), ...initialSearch } }}>
      <MemoryRouter initialEntries={['/fs-results']}>
        <Routes>
          <Route path="/fs-results" element={<FsResults client={client} />} />
          <Route path="/fs-attach" element={<AttachProbe />} />
          <Route path="/fs-create" element={<div>CREATE</div>} />
          <Route path="/fs-search" element={<div>SEARCH</div>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

describe('buildSearchQuery', () => {
  it('maps criteria to fuzzy q.<field> keys and a from/to year range', () => {
    expect(
      buildSearchQuery({
        ...emptySearch(),
        surname: 'Smith',
        eventType: 'birthLike',
        eventDateFrom: '1850',
        eventDateTo: '1855',
        eventPlace: 'Ohio',
      }),
    ).toEqual({
      surname: 'Smith~',
      'birthLikeDate.from': '+1850',
      'birthLikeDate.to': '+1855',
      birthLikePlace: 'Ohio~',
    });
  });

  it('sends gender as q.sex (FamilySearch rejects q.gender)', () => {
    expect(buildSearchQuery({ ...emptySearch(), surname: 'Smith', gender: 'Female' })).toEqual({
      surname: 'Smith~',
      sex: 'Female',
    });
  });

  it('supports residence (census) events', () => {
    expect(
      buildSearchQuery({ ...emptySearch(), surname: 'Hansen', eventType: 'residence', eventDateFrom: '1880', eventPlace: 'Denmark' }),
    ).toEqual({ surname: 'Hansen~', 'residenceDate.from': '+1880', residencePlace: 'Denmark~' });
  });
});

describe('pageWindow', () => {
  it('starts at the first page', () => {
    expect(pageWindow(1, 196)).toEqual([1, 2, 3, 4, 5]);
  });
  it('slides around the current page', () => {
    expect(pageWindow(8, 196)).toEqual([6, 7, 8, 9, 10]);
  });
  it('clamps to the last page', () => {
    expect(pageWindow(50, 50)).toEqual([46, 47, 48, 49, 50]);
  });
  it('never exceeds the available pages', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });
});

describe('FsResults', () => {
  beforeEach(() => {
    beginFsLogin.mockClear();
  });

  it('searches and selecting a person stores the attach target and advances', async () => {
    const client: FsResultsClient = { searchPersons: async () => FEED, getPerson: async () => ({ persons: [] }) };
    renderResults(client, { surname: 'Smith' });
    await userEvent.click(await screen.findByRole('button', { name: 'Select' }));
    expect(await screen.findByText('ATTACH:John Smith')).toBeInTheDocument();
  });

  it('explains a FamilySearch outage in plain words and offers Try again', async () => {
    let calls = 0;
    const client: FsResultsClient = {
      searchPersons: async () => {
        calls += 1;
        if (calls === 1) throw apiError(500, 'FamilySearch API 500: upstream blew up');
        return FEED;
      },
      getPerson: async () => ({ persons: [] }),
    };
    renderResults(client, { surname: 'Smith' });
    expect(await screen.findByRole('alert')).toHaveTextContent('FamilySearch is having trouble right now');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/John Smith/)).toBeInTheDocument();
  });

  it('redirects to the search form when there is nothing to search (e.g. a reload that lost state)', async () => {
    const searchPersons = vi.fn(async () => FEED);
    const client: FsResultsClient = { searchPersons, getPerson: async () => ({ persons: [] }) };
    renderResults(client, {}); // empty criteria, no pid
    expect(await screen.findByText('SEARCH')).toBeInTheDocument();
    expect(searchPersons).not.toHaveBeenCalled();
  });

  it('re-authenticates transparently when the FamilySearch session is dead (401)', async () => {
    const client: FsResultsClient = {
      searchPersons: async () => {
        throw apiError(401, 'FamilySearch API 401: token expired');
      },
      getPerson: async () => ({ persons: [] }),
    };
    renderResults(client, { surname: 'Smith' });
    await waitFor(() => expect(beginFsLogin).toHaveBeenCalledWith('/fs-results'));
    // We're re-auth'ing, not dead-ending on an error.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('labels parents with father/mother icons', async () => {
    const richFeed = {
      results: 1,
      entries: [
        {
          id: 'P1',
          score: 5,
          content: {
            gedcomx: {
              persons: [
                { id: 'P1', display: { name: 'Child Smith', gender: 'Male', birthDate: '1900', birthPlace: 'Ohio' } },
                { id: 'FA', display: { name: 'Pa Smith', gender: 'Male' } },
                { id: 'MO', display: { name: 'Ma Jones', gender: 'Female' } },
              ],
              relationships: [
                { type: 'http://gedcomx.org/ParentChild', person1: { resourceId: 'FA' }, person2: { resourceId: 'P1' } },
                { type: 'http://gedcomx.org/ParentChild', person1: { resourceId: 'MO' }, person2: { resourceId: 'P1' } },
              ],
            },
          },
        },
      ],
    };
    const client: FsResultsClient = { searchPersons: async () => richFeed, getPerson: async () => ({ persons: [] }) };
    renderResults(client, { surname: 'Smith' });
    expect(await screen.findByText('Pa Smith')).toBeInTheDocument();
    expect(screen.getByText('Ma Jones')).toBeInTheDocument();
    expect(screen.getByTitle('Father')).toBeInTheDocument();
    expect(screen.getByTitle('Mother')).toBeInTheDocument();
  });

  it('does not search when only an event type is set', async () => {
    const searchPersons = vi.fn(async () => FEED);
    const client: FsResultsClient = { searchPersons, getPerson: async () => ({ persons: [] }) };
    renderResults(client, { eventType: 'residence' });
    expect(await screen.findByText('SEARCH')).toBeInTheDocument();
    expect(searchPersons).not.toHaveBeenCalled();
  });

  it('explains an unknown Person ID instead of showing the raw 404', async () => {
    const client: FsResultsClient = {
      searchPersons: async () => ({ entries: [] }),
      getPerson: async () => {
        throw apiError(404, 'FamilySearch API 404: Failure in upstream call: Unable to read Person (upstream 404)');
      },
    };
    renderResults(client, { pid: 'ZZZZ-999' });
    expect(await screen.findByRole('alert')).toHaveTextContent('No Family Tree person found with ID ZZZZ-999');
  });

  it('explains a Person ID the account may not read instead of showing the raw 403', async () => {
    const client: FsResultsClient = {
      searchPersons: async () => ({ entries: [] }),
      getPerson: async () => {
        throw apiError(403, 'FamilySearch API 403: Failure in upstream call: Unable to read Person (upstream 403)');
      },
    };
    renderResults(client, { pid: 'P7LK-5KQ' });
    expect(await screen.findByRole('alert')).toHaveTextContent("FamilySearch won't show person P7LK-5KQ");
  });

  it('treats a 400 for the Person ID as not found and does not report it', async () => {
    const client: FsResultsClient = {
      searchPersons: async () => ({ entries: [] }),
      getPerson: async () => {
        throw apiError(400, 'FamilySearch API 400: Failure in upstream call: Unable to read Person (upstream 400)');
      },
    };
    renderResults(client, { pid: 'ZZZZ-999' });
    expect(await screen.findByRole('alert')).toHaveTextContent('No Family Tree person found with ID ZZZZ-999');
  });

  it('never sends pasted text in the Person ID box to FamilySearch (RECORDSEEK-F3)', async () => {
    let called = false;
    const client: FsResultsClient = {
      searchPersons: async () => ({ entries: [] }),
      getPerson: async () => {
        called = true;
        return {};
      },
    };
    renderResults(client, { pid: 'WIGA-NENG-LAND-BAPT-ISM1-911' });
    expect(await screen.findByRole('alert')).toHaveTextContent("isn't a Family Tree Person ID");
    expect(called).toBe(false);
  });

  it('uses getPerson in direct-PID mode', async () => {
    const client: FsResultsClient = {
      searchPersons: async () => ({ entries: [] }),
      getPerson: async () => ({ persons: [PERSON] }),
    };
    renderResults(client, { pid: 'PRIM-ARY1' });
    expect(await screen.findByText(/John Smith/)).toBeInTheDocument();
  });

  it('shows the total count and pages through results using the feed offset', async () => {
    const offsets: Array<number | undefined> = [];
    const client: FsResultsClient = {
      searchPersons: async (_query, options) => {
        offsets.push(options?.offset);
        return { results: 3902, entries: FEED.entries };
      },
      getPerson: async () => ({ persons: [] }),
    };
    renderResults(client, { surname: 'paukstys' });

    // The feed total surfaces as a real "of N results" count...
    expect(await screen.findByText(/of 3,902 results/)).toBeInTheDocument();
    // ...and numbered pages beyond page 1 now exist.
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(offsets).toContain(20));

    // "Last" jumps to the capped final page (50 pages → offset 49 * 20).
    await userEvent.click(screen.getByRole('button', { name: 'Last' }));
    await waitFor(() => expect(offsets).toContain(980));
  });
});
