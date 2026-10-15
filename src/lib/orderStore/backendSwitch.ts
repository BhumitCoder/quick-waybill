// Shared with excel-report-manager/src/lib/orderStore/backendSwitch.ts — keep both copies identical.
/**
 * Remote switch that decides where orders live, so the cut-over to Firestore
 * needs no redeploy and both apps change over together.
 *
 *   appConfig/storage.ordersBackend
 *     'files'     — master.xlsx files (today; also when the doc is missing)
 *     'frozen'    — saving paused while orders are being moved
 *     'firestore' — one Firestore document per order
 *
 * Read once at startup. When it changes, open tabs reload so nothing keeps
 * writing to the old place.
 */
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export type OrdersBackend = 'files' | 'frozen' | 'firestore';

const ref = doc(db, 'appConfig', 'storage');

function parse(value: unknown): OrdersBackend {
  return value === 'firestore' || value === 'frozen' ? value : 'files';
}

let current: Promise<OrdersBackend> | null = null;

/**
 * Where orders live for this session (read once, then cached). Never guesses:
 * if the switch can't be read it keeps retrying — falling back to 'files'
 * after the cut-over would read stale files and write to the wrong place.
 */
export function getOrdersBackend(): Promise<OrdersBackend> {
  if (!current) {
    current = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return parse((await getDoc(ref)).data()?.ordersBackend);
        } catch {
          await new Promise(r => setTimeout(r, Math.min(10_000, 1000 * 2 ** attempt)));
        }
      }
    })();
  }
  return current;
}

/** Forget the mode read at startup, so the next getOrdersBackend() reads the switch again. */
export function refreshOrdersBackend(): void {
  current = null;
}

/** Call `onChange` when the switch moves away from the mode currently in use. */
export function watchOrdersBackend(onChange: (next: OrdersBackend) => void): () => void {
  return onSnapshot(ref, snap => {
    const next = parse(snap.data()?.ordersBackend);
    void getOrdersBackend().then(mode => { if (next !== mode) onChange(next); });
  }, () => { /* keep running on the mode in use */ });
}

/** Report panel: reload when the switch changes, so every tab uses the new place. */
export function reloadOnBackendChange(): () => void {
  return watchOrdersBackend(() => window.location.reload());
}

export class SavingPausedError extends Error {
  constructor() {
    super('Orders are being moved to the new storage — saving is paused for a few minutes. Please try again shortly.');
    this.name = 'SavingPausedError';
  }
}
