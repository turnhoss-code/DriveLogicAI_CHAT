import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-drivelogicai-bbb8b997-f746-4916-bff3-3bb4f5caf863");
export const auth = getAuth(app);
// Standard Google Authentication for App Sign In (Email & Profile only - NO Google Drive scope required)
export const googleAuthProvider = new GoogleAuthProvider();

// Optional Google Drive Provider (Requested ONLY when user explicitly links Google Drive for cloud backups)
export const googleDriveProvider = new GoogleAuthProvider();
googleDriveProvider.addScope('https://www.googleapis.com/auth/drive.file');

// Default export alias
export const googleProvider = googleAuthProvider;
