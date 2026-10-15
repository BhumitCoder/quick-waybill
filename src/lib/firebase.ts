import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, collection } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDsdTCK3XOodXcuC1TWHAmxLAETDYv7AjE",
  authDomain: "zaiko-wholesale.firebaseapp.com",
  projectId: "zaiko-wholesale",
  storageBucket: "zaiko-wholesale.firebasestorage.app",
  messagingSenderId: "539852019524",
  appId: "1:539852019524:web:295eb0a2dcaa58a9532911",
  measurementId: "G-R7DHNRE9YQ",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, "zaiko-reports");

// Local testing only: `VITE_FIRESTORE_EMULATOR=127.0.0.1:8085 npm run dev`
// points this database at the Firestore emulator. Ignored in production builds.
const emulatorHost = import.meta.env.DEV ? import.meta.env.VITE_FIRESTORE_EMULATOR : undefined;
if (emulatorHost) {
  const [host, port] = String(emulatorHost).split(":");
  try {
    connectFirestoreEmulator(db, host, Number(port));
    console.warn(`[firebase] zaiko-reports → Firestore emulator at ${emulatorHost}`);
  } catch {
    /* already connected (hot reload reuses the same instance) */
  }
}
export const storage = getStorage(app);
export const companiesCollection = collection(db, "companies");
export const manifestsCollection = collection(db, "manifests");
export const returnsCollection = collection(db, "returns");
export const masterSyncCollection = collection(db, "masterSync");
