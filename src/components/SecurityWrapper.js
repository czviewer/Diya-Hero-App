import React, { useState, useEffect, useRef } from 'react';
import { View, AppState, PanResponder, StyleSheet, Text, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { signOut } from 'firebase/auth';
import { logUnauthorizedAttempt } from '../services/auth';
import { mobile_updateSessionData } from '../services/cloudFunctions';
import { auth, db } from '../services/firebaseConfig';
import { ref, get } from 'firebase/database';

const INACTIVITY_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

export default function SecurityWrapper({ children }) {
    const appState = useRef(AppState.currentState);
    const [isLocked, setIsLocked] = useState(false);
    const timerId = useRef(false);
    const isAuthenticating = useRef(false);

    // --- Biometric Authentication on Foreground ---
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                checkBiometrics();
            }
            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, []);

    const checkBiometrics = async () => {
        try {
            if (isAuthenticating.current) return;

            // Only check if user is actually logged in
            if (!auth.currentUser) return;
            const userId = auth.currentUser.uid;

            // Check if user has bypass enabled (for users with broken sensors etc.)
            try {
                const userSnap = await get(ref(db, `users/${userId}`));
                if (userSnap.exists()) {
                    const userData = userSnap.val();
                    if (userData.isBioBypass === true) {
                        setIsLocked(false);
                        setTimeout(() => { isAuthenticating.current = false; }, 500);
                        return; // Completely bypass remainder of biometric logic
                    }
                }
            } catch (dbErr) {
                console.log("Error checking bypass flag:", dbErr);
                // On error we log and continue to the normal hardware check just to be safe
            }

            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (hasHardware && isEnrolled) {
                isAuthenticating.current = true;
                mobile_updateSessionData({ biometricHardware: true }).catch(e => console.log('Sync error:', e));
                setIsLocked(true);
                const result = await LocalAuthentication.authenticateAsync({
                    promptMessage: 'Verify your identity to access the app',
                    disableDeviceFallback: false, // Allow PIN/Password fallback if fingerprint fails
                    cancelLabel: 'Cancel'
                });

                if (result.success) {
                    setIsLocked(false);
                    resetInactivityTimeout();
                    setTimeout(() => { isAuthenticating.current = false; }, 500);
                } else {
                    // FALLBACK: If authentication fails or is cancelled
                    setIsLocked(true); // Keep the app locked
                    setTimeout(() => { isAuthenticating.current = false; }, 500);
                    
                    // Note: We NO LONGER log out on cancellation. 
                    // This allows the user to try again later without needing full login.
                    console.log('[Security] Biometric authentication failed or cancelled. App remains locked.');
                }
            } else {
                // If device has no biometrics set up, admit them directly 
                // as per the requirement: "asked only on mobiles which have setted up fingerprint"
                mobile_updateSessionData({ biometricHardware: false }).catch(e => console.log('Sync error:', e));
                setIsLocked(false);
            }
        } catch (error) {
            console.log('Biometric error:', error);
            setIsLocked(false);
            setTimeout(() => { isAuthenticating.current = false; }, 500);
        }
    };

    // --- Inactivity Timeout ---
    const handleLogout = async () => {
        try {
            await signOut(auth);
            setIsLocked(false);
        } catch (e) {
            console.log('Error logging out due to inactivity/lock:', e);
        }
    };

    const resetInactivityTimeout = () => {
        if (timerId.current) {
            clearTimeout(timerId.current);
        }
        if (auth.currentUser) {
            timerId.current = setTimeout(handleLogout, INACTIVITY_TIMEOUT);
        }
    };

    useEffect(() => {
        // Initial setup on mount
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                resetInactivityTimeout();
                // Optional: You could call checkBiometrics() here for initial app load,
                // but usually the login screen handles initial authentication natively.
                // When already logged in and app starts cold, we can trigger it:
                if (appState.current === 'active' && !isLocked) {
                    checkBiometrics();
                }
            } else {
                if (timerId.current) clearTimeout(timerId.current);
                setIsLocked(false);
            }
        });

        return () => {
            unsubscribe();
            if (timerId.current) clearTimeout(timerId.current);
        }
    }, []);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponderCapture: () => {
                resetInactivityTimeout();
                return false;
            },
            onMoveShouldSetPanResponderCapture: () => {
                resetInactivityTimeout();
                return false;
            },
            onPanResponderTerminationRequest: () => true,
        })
    ).current;

    // Render a blocking screen if locked
    return (
        <View style={styles.container} {...panResponder.panHandlers}>
            {children}
            {isLocked && (
                <View style={[StyleSheet.absoluteFill, styles.lockedContainer]}>
                    <Text style={styles.lockedText}>App is locked. Please authenticate.</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    lockedContainer: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    lockedText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333'
    }
});
