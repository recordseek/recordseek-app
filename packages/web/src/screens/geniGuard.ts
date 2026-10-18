import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getGeniToken } from '../geni';
import { useGeniFlow } from '../session/GeniContext';

/**
 * The Geni token for screens after the source form. Without a token, or without
 * the source from /geni, it sends the user back to /geni (which has the sign-in).
 */
export function useGeniGuard(): string | null {
  const navigate = useNavigate();
  const { state } = useGeniFlow();
  const token = getGeniToken();
  const ready = Boolean(token && state.source);
  useEffect(() => {
    if (!ready) navigate('/geni', { replace: true });
  }, [ready, navigate]);
  return ready ? token : null;
}
