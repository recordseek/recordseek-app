export interface Ancestry2Context {
  userId: string;
  treeId: string;
  personId: string;
  personName: string;
}

export interface Ancestry2Status {
  connected: boolean;
  context?: Ancestry2Context;
  message?: string;
}

export interface Ancestry2SaveRequest {
  target: Pick<Ancestry2Context, 'treeId' | 'personId'>;
  source: { title: string; note: string };
  citation: { detail: string; url: string };
}

export interface Ancestry2SaveResult {
  ok?: boolean;
  verified?: boolean;
  sourceId?: string;
  citationId?: string;
  personUrl?: string;
  message?: string;
  mayHaveWritten?: boolean;
  phase?: string;
}

export interface Ancestry2Journal {
  state: 'pending' | 'complete' | 'missing';
  result?: Ancestry2SaveResult;
}

export function companionRequest<T>(
  op: 'status' | 'save' | 'job',
  data?: Ancestry2SaveRequest | { jobId: string },
  options?: { requestId?: string; timeoutMs?: number },
): Promise<T>;
