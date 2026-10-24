import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { buildGedcomxPerson, personDetailUrl } from '@recordseek/core';
import { useSession, EVENT_TAGS, type EventTag, type AttachTarget } from '../session/SessionContext';
import { createFsClient } from '../auth/fsClient';
import { beginFsLogin, isFsAuthError } from '../fsAuth';
import { describeFsError, reportFsError } from '../fsErrors';
import { reportError } from '../sentry';
import { track } from '../analytics';
import { BackButton } from '../components/BackButton';

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
  descriptionUrl(id: string): string;
  createSourceDescription(draft: {
    about?: string;
    citation?: string;
    title?: string;
    text?: string;
    changeMessage?: string;
  }): Promise<string | null>;
  createPersonSourceRef(
    personId: string,
    ref: { descriptionUrl: string; tags?: string[]; changeMessage?: string },
  ): Promise<unknown>;
  createPerson(person: unknown): Promise<string | null>;
}

function statusOf(err: unknown): unknown {
  return (err as { status?: unknown } | null)?.status;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * fs-create — the processing screen. Runs the create -> file -> attach pipeline
 * once on mount and routes to fs-complete. A failed step is retried once
 * automatically; steps that already succeeded are not repeated (no duplicate
 * source or person). If the retry fails too, the user is told what was saved
 * and offered a way back.
 */
export function FsCreate({
  client: providedClient,
  retryDelayMs = 1500,
}: {
  client?: FsCreateClient;
  retryDelayMs?: number;
}) {
  const { state, setComplete, setCreatedSourceId, selectPerson } = useSession();
  const navigate = useNavigate();
  const client = useMemo<FsCreateClient>(() => providedClient ?? createFsClient(), [providedClient]);
  const [status, setStatus] = useState('Starting…');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [backTo, setBackTo] = useState('/fs-source');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const draft = state.draft;
    if (!draft || !draft.url) {
      navigate('/fs-source', { replace: true });
      return;
    }
    const d = draft;

    // Progress survives the retry so nothing is created twice. The source id and a
    // newly created person are also kept in the session, for a re-login round trip.
    let step = 'create_source';
    let descriptionId = state.createdSourceId;
    // A real pid means an existing person was picked; a newPerson draft left from
    // visiting fs-addperson must not override that (empty person, FS 400).
    const needsNewPerson = Boolean(state.newPerson && !state.attach?.pid);
    let attachTarget: AttachTarget | null = needsNewPerson ? null : state.attach;
    let createdPerson: AttachTarget | null = null;

    const saveOnly = state.complete === 'noAttachment' || (!state.attach && !state.newPerson);

    async function pipeline(): Promise<void> {
      step = 'create_source';
      if (!descriptionId) {
        setStatus('Generating source…');
        const id = await client.createSourceDescription({
          about: d.url.trim(),
          citation: d.citation.trim(),
          title: d.title.trim(),
          text: d.notes.trim(),
          changeMessage: ATTACH_MSG,
        });
        if (!id) {
          throw new Error('FamilySearch did not return a source id.');
        }
        descriptionId = id;
        setCreatedSourceId(id);
        track('fs_source_created');
      }

      // A freshly created source description already lands in the user's source
      // box under Home (Unorganized) — where they look for it — so there is no
      // folder-filing step. (The legacy app only moved a source into a folder
      // when the user explicitly picked one; filing every source into a hidden
      // "RecordSeek" folder is what made them seem to vanish.)

      if (saveOnly) {
        setComplete('noAttachment');
        navigate('/fs-complete', { replace: true });
        return;
      }

      if (needsNewPerson && !createdPerson && state.newPerson) {
        step = 'create_person';
        setStatus('Creating the new person…');
        const newPid = await client.createPerson(buildGedcomxPerson(state.newPerson));
        if (!newPid) {
          throw new Error('FamilySearch did not return a new person id.');
        }
        track('fs_person_added');
        const name = [state.newPerson.givenName, state.newPerson.surname].filter(Boolean).join(' ').trim();
        createdPerson = {
          pid: newPid,
          name: name || 'the new person',
          url: personDetailUrl(newPid),
          justification: state.attach?.justification ?? '',
        };
        attachTarget = createdPerson;
        selectPerson(createdPerson);
      }
      if (!attachTarget) {
        setComplete('noAttachment');
        navigate('/fs-complete', { replace: true });
        return;
      }

      step = 'attach_source';
      setStatus(`Attaching source to ${attachTarget.name}…`);
      const tags = EVENT_TAGS.filter((tag) => state.tags[tag]).map((tag) => `http://gedcomx.org/${TAG_LABEL[tag]}`);
      await client.createPersonSourceRef(attachTarget.pid, {
        descriptionUrl: client.descriptionUrl(descriptionId),
        tags,
        changeMessage: attachTarget.justification || 'Attached by RecordSeek',
      });
      track('fs_source_attached');
      setComplete({ ...attachTarget });
      navigate('/fs-complete', { replace: true });
    }

    function savedSoFar(): string | null {
      const parts: string[] = [];
      if (descriptionId) {
        parts.push('Your source was saved to your FamilySearch source box.');
      }
      if (createdPerson) {
        parts.push(`${createdPerson.name} was added to the Family Tree (ID ${createdPerson.pid}).`);
      }
      return parts.length > 0 ? parts.join(' ') : null;
    }

    // Back to the screen that led here. Once a new person exists, never back to
    // the add-person form (it would create them again).
    function fail(message: string, route?: string): void {
      setError(message);
      setSaved(savedSoFar());
      setBackTo(route ?? (saveOnly ? '/fs-source' : needsNewPerson && !createdPerson ? '/fs-addattach' : '/fs-attach'));
    }

    async function run(): Promise<void> {
      for (let attempt = 1; ; attempt++) {
        try {
          await pipeline();
          return;
        } catch (err) {
          // Signed out mid-way: sign in again and resume here. Progress is in the
          // session, so the resumed run skips what already succeeded.
          if (isFsAuthError(err)) {
            track('fs_action_failed', { step, reason: 'auth' });
            beginFsLogin('/fs-create').catch((loginErr: unknown) => {
              reportError(loginErr, { screen: 'fs-create', step: 'begin_login' });
              fail('Your FamilySearch sign-in has expired, and signing in again failed. Go back and try again.');
            });
            return;
          }
          // The person was merged or deleted after the user picked them. Retrying won't help.
          if (step === 'attach_source' && statusOf(err) === 410) {
            track('fs_action_failed', { step, status: 410 });
            fail(
              'That person was merged or deleted in FamilySearch, so the source could not be attached. ' +
                'Go back and search for the person again.',
              '/fs-search',
            );
            return;
          }
          // FamilySearch refused the attach: the account can't edit this person
          // (some people are protected, or living and not yours). Expected, not a
          // bug — tell the user plainly, skip the retry, and don't report it.
          if (step === 'attach_source' && statusOf(err) === 403) {
            track('fs_action_failed', { step, status: 403 });
            fail(
              "FamilySearch wouldn't let you attach a source to this person. Your account may not have " +
                'permission to edit them — some people are protected, or living and added by someone else. ' +
                'Go back and choose a different person.',
              '/fs-search',
            );
            return;
          }
          if (attempt === 1) {
            track('fs_action_retried', { step });
            setStatus('That didn’t work. Trying again…');
            await wait(retryDelayMs);
            continue;
          }
          // The shape of what we sent (no content) so FamilySearch 400s can be diagnosed.
          reportFsError(err, {
            screen: 'fs-create',
            step,
            ...(step === 'create_source'
              ? {
                  urlScheme: (d.url.trim().split(':')[0] ?? '').slice(0, 10),
                  urlLength: d.url.trim().length,
                  titleLength: d.title.trim().length,
                  citationLength: d.citation.trim().length,
                  notesLength: d.notes.trim().length,
                }
              : {}),
          });
          track('fs_action_failed', { step });
          fail(describeFsError(err));
          return;
        }
      }
    }

    void run();
    // run() intentionally uses the wizard state captured at mount; the create
    // happens once and the guard above prevents a double run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <main>
        <h3>We couldn’t finish saving your source</h3>
        <p role="alert">{error}</p>
        {saved && <p>{saved}</p>}
        <div className="form-footer">
          <BackButton onClick={() => navigate(backTo)} />
        </div>
      </main>
    );
  }

  return (
    <main>
      <h3>Creating your source</h3>
      <p role="status">{status}</p>
    </main>
  );
}
