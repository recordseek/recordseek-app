export function companionRequest(op, data = {}, options = {}) {
  const requestId = options.requestId || crypto.randomUUID();
  const timeoutMs = options.timeoutMs ?? (op === 'save' ? 85000 : 6000);
  return new Promise((resolve, reject) => {
    const clean = () => { clearTimeout(timer); window.removeEventListener('message', receive); };
    const receive = event => {
      const m = event.data;
      if (event.source !== window || event.origin !== location.origin || m?.channel !== 'recordseek.ancestry2' || m.version !== 1 || m.direction !== 'response' || m.requestId !== requestId) return;
      clean();
      if (!m.ok) reject(new Error(m.message || 'The Ancestry2 companion could not complete the request.'));
      else resolve(m.result);
    };
    const timer = setTimeout(() => { clean(); reject(new Error(op === 'save' ? 'Save outcome unknown. Check the result before trying again.' : 'The Ancestry2 companion is not responding. Install it, reload this page, and connect an Ancestry person tab.')); }, timeoutMs);
    window.addEventListener('message', receive);
    try { window.postMessage({ ...data, channel: 'recordseek.ancestry2', version: 1, direction: 'request', requestId, op }, location.origin); }
    catch (error) { clean(); reject(error); }
  });
}
