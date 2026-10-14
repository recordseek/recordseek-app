import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { buildGedcomxPerson, personDetailUrl } from '@recordseek/core';
import { useSession, EVENT_TAGS, type EventTag } from '../session/SessionContext';
import { createFsClient } from '../auth/fsClient';
import { reportError } from '../sentry';

const ATTACH_MSG = 'Source created by RecordSeek.com';

const TAG_LABEL: Record<EventTag, string> = {
  name: 'Name',
  gender: 'Gender',
  birth: 'Birth',
  christening: 'Christening',
  death: 'Death',
  burial: 'Burial',
};

export interface FsCreateClient {
  apiHost: string;
  descriptionUrl(id: string): string;
  createSourceDescription(draft: {
    about?: string;
    citation?: string;
    title?: string;
    text?: string;
    changeMessage?: string;
  }): Promise<string | null>;
  getCurrentUser(): Promise<{ id?: string } | null>;
  // FS collection shapes are loosely typed; read defensively.
  getUserCollections(userId: string): Promise<Array<Record<string, unknown>>>;
  createCollection(collection: { title: string }): Promise<{ headers: Headers }>;
  addDescriptionToCollection(collectionUrl: string, descriptionId: string): Promise<unknown>;
  createPersonSourceRef(
    personId: string,
    ref: { descriptionUrl: string; tags?: string[]; changeMessage?: string },
  ): Promise<unknown>;
  createPerson(person: unknown): Promise<string | null>;
}

/** File the source description into the user's "RecordSeek" folder. Best-effort. */
async function fileInRecordSeekFolder(client: FsCreateClient, descriptionId: string): Promise<void> {
  try {
    const user = await client.getCurrentUser();
    const userId = user?.id;
    if (!userId) return;
    const collections = await client.getUserCollections(userId);
    const folder = collections.find((c) => c.title === 'RecordSeek');
    let collectionUrl: string | null = null;
    if (folder) {
      const links = folder.links as { self?: { href?: string } } | undefined;
      collectionUrl = links?.self?.href ?? `${client.apiHost}/platform/sources/collections/${String(folder.id)}`;
    } else {
      const res = await client.createCollection({ title: 'RecordSeek' });
      collectionUrl = res.headers.get('location');
    }
    if (collectionUrl) {
      await client.addDescriptionToCollection(`${collectionUrl}/descriptions`, descriptionId);
    }
  } catch {
    // Filing into the source box is a convenience; never block the attach on it.
  }
}

/**
 * fs-create — the processing screen. Runs the create -> file -> attach pipeline
 * once on mount and routes to fs-complete. Unlike the legacy controller, a
 * failed step surfaces the real error instead of stranding the user on a
 * spinner / showing a blanket message.
 */
export function FsCreate({ client: providedClient }: { client?: FsCreateClient }) {
  const { state, setComplete, setCreatedSourceId } = useSession();
  const navigate = useNavigate();
  const client = useMemo<FsCreateClient>(() => providedClient ?? createFsClient(), [providedClient]);
  const [status, setStatus] = useState('Starting…');
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function run(): Promise<void> {
      try {
        const draft = state.draft;
        if (!draft || !draft.url) {
          navigate('/fs-source', { replace: true });
          return;
        }

        setStatus('Generating source…');
        let descriptionId = state.createdSourceId;
        if (!descriptionId) {
          descriptionId = await client.createSourceDescription({
            about: draft.url.trim(),
            citation: draft.citation.trim(),
            title: draft.title.trim(),
            text: draft.notes.trim(),
            changeMessage: ATTACH_MSG,
          });
          if (!descriptionId) {
            throw new Error('FamilySearch did not return a source id.');
          }
          setCreatedSourceId(descriptionId);
        }

        setStatus('Filing in your RecordSeek source box…');
        await fileInRecordSeekFolder(client, descriptionId);

        // Save-only path: nothing to attach to.
        if (state.complete === 'noAttachment' || (!state.attach && !state.newPerson)) {
          setComplete('noAttachment');
          navigate('/fs-complete', { replace: true });
          return;
        }

        // Determine the attach target, creating a brand-new person first if the
        // user went down the new-person branch.
        let attachTarget = state.attach;
        if (state.newPerson) {
          setStatus('Creating the new person…');
          const newPid = await client.createPerson(buildGedcomxPerson(state.newPerson));
          if (!newPid) {
            throw new Error('FamilySearch did not return a new person id.');
          }
          const name = [state.newPerson.givenName, state.newPerson.surname].filter(Boolean).join(' ').trim();
          attachTarget = {
            pid: newPid,
            name: name || 'the new person',
            url: personDetailUrl(newPid),
            justification: state.attach?.justification ?? '',
          };
        }
        if (!attachTarget) {
          setComplete('noAttachment');
          navigate('/fs-complete', { replace: true });
          return;
        }

        setStatus(`Attaching source to ${attachTarget.name}…`);
        const tags = EVENT_TAGS.filter((tag) => state.tags[tag]).map((tag) => `http://gedcomx.org/${TAG_LABEL[tag]}`);
        await client.createPersonSourceRef(attachTarget.pid, {
          descriptionUrl: client.descriptionUrl(descriptionId),
          tags,
          changeMessage: attachTarget.justification || 'Attached by RecordSeek',
        });
        setComplete({ ...attachTarget });
        navigate('/fs-complete', { replace: true });
      } catch (err) {
        reportError(err, { screen: 'fs-create' });
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    void run();
    // run() intentionally uses the wizard state captured at mount; the create
    // happens once and the guard above prevents a double run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <h3>Creating your source</h3>
      {error ? <p role="alert">{error}</p> : <p role="status">{status}</p>}
    </main>
  );
}
