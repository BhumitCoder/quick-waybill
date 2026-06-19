import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection } from "firebase/firestore";
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
export const storage = getStorage(app);
export const companiesCollection = collection(db, "companies");
export const manifestsCollection = collection(db, "manifests");
