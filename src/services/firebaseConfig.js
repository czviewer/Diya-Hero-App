import { initializeApp, getApps } from 'firebase/app';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import * as SecureStore from 'expo-secure-store';
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

// --- APP CHECK CONFIGURATION ---
// We bridge the Firebase JS SDK to the Native Play Integrity module
const appCheck = initializeAppCheck(app, {
    provider: new CustomProvider({
        getToken: async () => {
            try {
                // Import the native module dynamically
                const { default: nativeAppCheck } = await import('@react-native-firebase/app-check');

                // MANDATORY: Initialize the native provider once
                // This resolves "No AppCheckProvider installed" error on Android
                if (!global.__NATIVE_APP_CHECK_INITIALIZED__) {
                    try {
                        const nativeModule = nativeAppCheck();

                        // v21.x recommended way to create and configure a provider
                        if (typeof nativeModule.newReactNativeFirebaseAppCheckProvider === 'function') {
                            const provider = nativeModule.newReactNativeFirebaseAppCheckProvider();
                            provider.configure({
                                android: {
                                    provider: 'playIntegrity',
                                },
                                isTokenAutoRefreshEnabled: true,
                            });

                            await nativeModule.initializeAppCheck({
                                provider,
                                isTokenAutoRefreshEnabled: true,
                            });
                            console.log('[AppCheck] v21.x Native provider successfully initialized');
                        } else if (typeof nativeModule.activate === 'function') {
                            // Fallback for older versions if initializeAppCheck is missing
                            await nativeModule.activate('playIntegrity', true);
                            console.log('[AppCheck] Legacy Native provider activated');
                        }

                        global.__NATIVE_APP_CHECK_INITIALIZED__ = true;
                    } catch (initError) {
                        console.warn('[AppCheck] Native initialization warning:', initError.message);
                    }
                }

                const { token } = await nativeAppCheck().getToken(true);

                // Store status for security diagnostics
                global.__APP_CHECK_STATUS__ = {
                    success: true,
                    timestamp: new Date().toISOString(),
                    tokenPrefix: token ? token.substring(0, 5) + '...' : 'none'
                };

                return {
                    token,
                    expireTimeMillis: Date.now() + (60 * 60 * 1000), // Approx 1 hour
                };
            } catch (error) {
                console.error('[AppCheck] Fatal error getting native token:', error);

                // Store error for security diagnostics
                global.__APP_CHECK_STATUS__ = {
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };

                throw error;
            }
        },
    }),
    isTokenAutoRefreshEnabled: true,
});

// Secure Storage Adapter for Firebase Auth
const SecureStorageAdapter = {
    getItem: async (key) => {
        try {
            const safeKey = key.replace(/[^a-zA-Z0-9.-]/g, '_');
            return await SecureStore.getItemAsync(safeKey);
        } catch (e) {
            console.error('SecureStore getItem error:', e);
            return null;
        }
    },
    setItem: async (key, value) => {
        try {
            const safeKey = key.replace(/[^a-zA-Z0-9.-]/g, '_');
            await SecureStore.setItemAsync(safeKey, value);
        } catch (e) {
            console.error('SecureStore setItem error:', e);
        }
    },
    removeItem: async (key) => {
        try {
            const safeKey = key.replace(/[^a-zA-Z0-9.-]/g, '_');
            await SecureStore.deleteItemAsync(safeKey);
        } catch (e) {
            console.error('SecureStore removeItem error:', e);
        }
    }
};

let auth;
try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(SecureStorageAdapter)
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
