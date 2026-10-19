export interface Ancestry2Tree {
  id: string;
  name: string;
}

/** The companion's view of the Ancestry session. Version 2+ companions report `version`. */
export interface Ancestry2Status {
  version?: number;
  signedIn: boolean;
  userId?: string;
  trees?: Ancestry2Tree[];
  recentTreeId?: string;
}

export interface Ancestry2Person {
  personId: string;
  name: string;
  gender: '' | 'male' | 'female';
  living: boolean;
  birth: string;
  death: string;
}

export interface Ancestry2SaveRequest {
  userId: string;
  target: { treeId: string; personId: string };
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
  op: 'status' | 'signin' | 'search' | 'save' | 'job',
  data?: Ancestry2SaveRequest | { jobId: string } | { treeId: string; name: string },
  options?: { requestId?: string; timeoutMs?: number },
): Promise<T>;
