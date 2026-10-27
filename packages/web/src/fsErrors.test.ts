import { describe, it, expect } from 'vitest';
import { FsApiError, FsNetworkError } from '@recordseek/core';
import { fsErrorContext } from './fsErrors';

describe('fsErrorContext', () => {
  it('is empty for non-FS errors', () => {
    expect(fsErrorContext(new Error('boom'))).toEqual({});
    expect(fsErrorContext(new FsNetworkError('offline'))).toEqual({});
  });

  it("pulls FamilySearch's status, code, label and message", () => {
    const body = JSON.stringify({
      errors: [{ code: 400, label: 'TF_PERSON_CREATE', message: 'Unable to create TF person' }],
    });
    expect(fsErrorContext(new FsApiError(400, body, 'ignored'))).toEqual({
      fsStatus: 400,
      fsCode: 400,
      fsLabel: 'TF_PERSON_CREATE',
      fsMessage: 'Unable to create TF person',
    });
  });

  it('caps a long message and still reports the status', () => {
    const body = JSON.stringify({ errors: [{ message: 'x'.repeat(500) }] });
    const ctx = fsErrorContext(new FsApiError(400, body));
    expect(ctx.fsStatus).toBe(400);
    expect((ctx.fsMessage as string).length).toBe(200);
  });

  it('falls back to a body snippet when the body is not JSON', () => {
    const ctx = fsErrorContext(new FsApiError(502, '<html>Bad Gateway</html>'));
    expect(ctx).toEqual({ fsStatus: 502, fsBodySnippet: '<html>Bad Gateway</html>' });
  });
});
