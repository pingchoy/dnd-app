import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "dnd-app-9609f.firebaseapp.com",
  projectId: "dnd-app-9609f",
  storageBucket: "dnd-app-9609f.appspot.com",
  messagingSenderId: "534001515274",
  appId: "1:534001515274:web:b956916119a9a60933d8f3",
};

// Guard against re-initialization on hot-reloads
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export { app };
