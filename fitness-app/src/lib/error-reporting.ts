import Storage from 'expo-sqlite/kv-store';

import { API_URL } from '@/lib/api';

type ErrorHandler = (error: Error, isFatal?: boolean) => void;
type GlobalErrorUtils = { getGlobalHandler: () => ErrorHandler; setGlobalHandler: (h: ErrorHandler) => void };

const PENDING_KEY = 'pending-crash-report';

function send(report: string) {
  return fetch(`${API_URL}/client-error`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: report });
}

/**
 * Sends uncaught JS errors to the server log. A fatal error kills the app before a request can finish,
 * so the report is first written to storage synchronously and sent again on the next start.
 */
export function installErrorReporting() {
  try {
    const pending = Storage.getItemSync(PENDING_KEY);
    if (pending) send(pending).then(() => Storage.removeItemSync(PENDING_KEY)).catch(() => {});
  } catch {}

  const utils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    const report = JSON.stringify({
      message: String(error?.message ?? error).slice(0, 2000),
      stack: String(error?.stack ?? '').slice(0, 8000),
      fatal: !!isFatal,
    });
    try {
      if (isFatal) Storage.setItemSync(PENDING_KEY, report);
    } catch {}
    send(report).then(() => isFatal && Storage.removeItemSync(PENDING_KEY)).catch(() => {});
    previous(error, isFatal);
  });
}
