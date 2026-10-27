/**
 * FamilySearch feature flags.
 *
 * Marriage (couple) source tagging is disabled in production. The couple
 * source-ref write 400s ("CreateTfEntityReference", RECORDSEEK-EX) and the
 * correct FamilySearch payload is still unverified against the beta sandbox.
 * While this is false:
 *   - FsAttach does not render the Marriage checkbox (no no-op control), and
 *   - fs-create performs no couple write.
 * Flip to true only once the payload is confirmed on FS beta; the UI and the
 * write re-enable together from this single flag.
 */
export const MARRIAGE_WRITE_ENABLED = false;
