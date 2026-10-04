/**
 * The TV's pairing QR code opens the web app at /app/#pair=123456. The code is kept for this browser tab until a
 * parent is signed in, so it survives the sign-in redirect, and the parent still taps "Approve TV" to connect.
 */
const KEY = 'hometide.pair-code';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Read a pairing code from the URL fragment (web only), remember it, and remove it from the address bar. */
export function capturePairCode(location: { hash: string } | null = typeof window !== 'undefined' ? window.location : null): string | null {
  const match = location?.hash?.match(/(?:^#|&)pair=(\d{6})(?:&|$)/);
  if (!match) return null;
  storage()?.setItem(KEY, match[1]);
  try {
    window.history?.replaceState?.(null, '', window.location.pathname + window.location.search);
  } catch {
    /* The fragment stays visible; the code still works and expires in 10 minutes. */
  }
  return match[1];
}

/** The remembered pairing code, once. */
export function takePairCode(): string | null {
  const store = storage();
  const code = store?.getItem(KEY) ?? null;
  if (code) store?.removeItem(KEY);
  return code && /^\d{6}$/.test(code) ? code : null;
}
