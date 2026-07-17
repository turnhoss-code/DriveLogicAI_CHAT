import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-drivelogicai-bbb8b997-f746-4916-bff3-3bb4f5caf863");
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

