import { API_URL } from '@/lib/api';

type ErrorHandler = (error: Error, isFatal?: boolean) => void;
type GlobalErrorUtils = { getGlobalHandler: () => ErrorHandler; setGlobalHandler: (h: ErrorHandler) => void };

/** Sends uncaught JS errors to the server log, so crashes on the phone can be diagnosed. */
export function installErrorReporting() {
  const utils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    fetch(`${API_URL}/client-error`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: String(error?.message ?? error), stack: String(error?.stack ?? '').slice(0, 8000), fatal: !!isFatal }),
    }).catch(() => {});
    previous(error, isFatal);
  });
}
