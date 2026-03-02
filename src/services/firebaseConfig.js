import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import SecureStorage from '../utils/SecureStorage';
import { initTimeSyncModular } from './timeManager';

const firebaseConfig = {
    apiKey: "AIzaSyBU3K7gRzqiqQt3o9thoEpd06ReLGVmm_w",
    authDomain: "diya-hero.firebaseapp.com",
    databaseURL: "https://diya-hero-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "diya-hero",
    storageBucket: "diya-hero.firebasestorage.app",
    messagingSenderId: "455829653263",
    appId: "1:455829653263:web:5a31c65bdab2b9cee0607a",
    measurementId: "G-DZYHPLQD3F"
};

// Initialize Firebase (only if not already initialized)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth with SecureStorage persistence
// Use getAuth if already initialized to avoid error
let auth;
try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(SecureStorage)
    });
} catch (error) {
    if (error.code === 'auth/already-initialized') {
        auth = getAuth(app);
    } else {
        throw error;
    }
}

const db = getDatabase(app);

// Initialize Time Sync
initTimeSyncModular(db);

export { app, auth, db };
