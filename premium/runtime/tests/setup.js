// jsdom provides no crypto.subtle; Node ≥18 does. Graft the native WebCrypto
// implementation onto the test global so verifyLicense() exercises the real
// ES256 path (same API the browser support floor provides).
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
