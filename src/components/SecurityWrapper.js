import React, { useState, useEffect, useRef } from 'react';
import { View, AppState, PanResponder, StyleSheet, Text, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { signOut } from 'firebase/auth';
import { logUnauthorizedAttempt } from '../services/auth';
import { mobile_updateSessionData } from '../services/cloudFunctions';
import { auth } from '../services/firebaseConfig';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export default function SecurityWrapper({ children }) {
    const appState = useRef(AppState.currentState);
    const [isLocked, setIsLocked] = useState(false);
    const timerId = useRef(false);

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
            // Only check if user is actually logged in
            if (!auth.currentUser) return;
            const userId = auth.currentUser.uid;

            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (hasHardware && isEnrolled) {
                mobile_updateSessionData({ biometricHardware: true }).catch(e => console.log('Sync error:', e));
                setIsLocked(true);
                const result = await LocalAuthentication.authenticateAsync({
                    promptMessage: 'Verify your identity to access the app',
                    disableDeviceFallback: true, // Strictly disable PIN/Password fallback
                    cancelLabel: 'Cancel'
                });

                if (result.success) {
                    setIsLocked(false);
                    resetInactivityTimeout();
                } else {
                    // If they cancel or fail too many times, sign them out to protect data
                    if (auth.currentUser) {
                        try {
                            await logUnauthorizedAttempt(
                                auth.currentUser.uid,
                                auth.currentUser.email,
                                "Failed Biometric Authentication (Device Lockout)"
                            );
                        } catch (e) {
                            console.log("Failed to log biometric failure", e);
                        }
                    }
                    await handleLogout();
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
    if (isLocked) {
        return (
            <View style={styles.lockedContainer}>
                <Text style={styles.lockedText}>App is locked. Please authenticate.</Text>
            </View>
        )
    }

    return (
        <View style={styles.container} {...panResponder.panHandlers}>
            {children}
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
