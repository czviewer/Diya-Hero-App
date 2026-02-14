import {
    signInWithEmailAndPassword,
    signOut as firebaseSignOut
} from 'firebase/auth';
import { ref, get, set, push, update, onValue } from 'firebase/database';
import { auth, db } from './firebaseConfig';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { logActivityAsync, logActivity, ActivityType } from './activityLog';

/**
 * Generates or retrieves a unique device ID.
 */
export async function getDeviceId() {
    if (Platform.OS === 'android') {
        return Application.getAndroidId();
    } else if (Platform.OS === 'ios') {
        return (await Application.getIosIdForVendorAsync()) || 'unknown-ios-device';
    }
    return 'unknown-device';
}

/**
 * Checks if the current device is bound to the user's account.
 */
export async function checkDeviceBinding(userUid) {
    const currentDeviceId = await getDeviceId();
    const deviceRef = ref(db, `users/${userUid}/boundDevice`);
    const snapshot = await get(deviceRef);

    if (snapshot.exists()) {
        const savedDeviceId = snapshot.val();
        if (savedDeviceId !== currentDeviceId) {
            return { allowed: false, error: "This account is already registered to another device." };
        }
        return { allowed: true };
    } else {
        // Bind device for first time login
        await set(deviceRef, currentDeviceId);

        // Log device binding (async, crash-proof)
        logActivityAsync(ActivityType.DEVICE_BIND, {
            deviceId: currentDeviceId,
            platform: Platform.OS
        });

        return { allowed: true };
    }
}

export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 1. Check if account is active
        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
            const userData = snapshot.val();
            if (userData.isActive === false) {
                await firebaseSignOut(auth);
                throw new Error("Your account has been deactivated. Please contact your administrator.");
            }
        }

        const bindingResult = await checkDeviceBinding(user.uid);

        if (!bindingResult.allowed) {
            console.log('[Auth] Device binding failed:', bindingResult.error);

            // Log unauthorized device attempt BEFORE logout
            try {
                const deviceId = await getDeviceId();

                // Silently fetch location for the log
                let location = null;
                try {
                    const { status } = await Location.getForegroundPermissionsAsync();
                    if (status === 'granted') {
                        const loc = await Location.getCurrentPositionAsync({
                            accuracy: Location.Accuracy.Balanced,
                            timeout: 5000,
                        });
                        location = {
                            latitude: loc.coords.latitude,
                            longitude: loc.coords.longitude,
                            accuracy: loc.coords.accuracy,
                        };
                    }
                } catch (locErr) {
                    // Silent - location is optional
                }

                const attemptRef = ref(db, 'unauthorizedAttempts');
                const newAttemptRef = push(attemptRef);
                await set(newAttemptRef, {
                    userId: userCredential.user.uid,
                    email,
                    deviceId,
                    platform: Platform.OS,
                    timestamp: new Date().toISOString(),
                    reason: bindingResult.error,
                    location, // { latitude, longitude, accuracy } or null
                });
                console.log('[Auth] Unauthorized attempt logged successfully');
            } catch (logError) {
                console.error('[Auth] Failed to log unauthorized attempt:', logError);
            }

            await firebaseSignOut(auth); // Log out immediately if binding fails
            console.log('[Auth] User signed out, throwing error');
            throw new Error(bindingResult.error);
        }

        // Log successful login (async, crash-proof)
        logActivityAsync(ActivityType.LOGIN, {
            email,
            timestamp: new Date().toISOString()
        });

        // Update session data (App Version, Permissions, etc.)
        await updateUserSessionData(user.uid);

        return userCredential.user;
    } catch (error) {
        console.error('[Auth] loginUser error:', error.message);
        throw error;
    }
}

/**
 * Updates user session data including App Version and Permissions
 * Only writes to DB if data has changed to minimize writes
 */
export async function updateUserSessionData(userId) {
    try {
        const version = Application.nativeApplicationVersion || '1.0.0';
        const build = Application.nativeBuildVersion || '1';

        // Get Permissions (safely)
        let notifStatus = 'unknown';
        try {
            const { status } = await Notifications.getPermissionsAsync();
            notifStatus = status;
        } catch (e) { console.log('Error fetching notification status:', e); }

        let locStatus = 'unknown';
        try {
            const { status } = await Location.getForegroundPermissionsAsync();
            locStatus = status;
        } catch (e) { console.log('Error fetching location status:', e); }

        // Fetch existing data to compare
        const userRef = ref(db, `users/${userId}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val() || {};

        const existingAppVersion = userData.appVersion || {};
        const existingPermissions = userData.deviceInfo?.permissions || {};

        const updates = {};
        const timestamp = new Date().toISOString();
        let hasChanges = false;

        // 1. Check App Version
        if (existingAppVersion.versionName !== version || existingAppVersion.versionCode !== build) {
            updates[`users/${userId}/appVersion`] = {
                versionName: version,
                versionCode: build,
                lastUpdated: timestamp
            };
            hasChanges = true;
        }

        // 2. Check Permissions
        if (existingPermissions.notifications !== notifStatus || existingPermissions.location !== locStatus) {
            updates[`users/${userId}/deviceInfo/permissions`] = {
                notifications: notifStatus,
                location: locStatus,
                lastChecked: timestamp
            };
            hasChanges = true;
        }

        // Only write if changes detected
        if (hasChanges) {
            await update(ref(db), updates);
            console.log('Session data updated in DB');
        } else {
            console.log('Session data unchanged, skipping DB write');
        }
    } catch (error) {
        console.error('[Auth] Failed to update session data:', error);
        // non-blocking error
    }
}

export async function logoutUser() {
    // Log logout BEFORE signing out (must await to ensure it completes while authenticated)
    try {
        await logActivity(ActivityType.LOGOUT, {
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        // Silent failure - don't block logout if logging fails
        console.error('[Auth] Logout logging failed:', error);
    }

    return firebaseSignOut(auth);
}

export async function submitSignupRequest(requestData) {
    // requestData: { name, email, password, phone, employeeId, pushToken }
    try {
        const { employeeId, ...rest } = requestData;
        await set(ref(db, `signupRequests/${employeeId}`), {
            ...rest,
            employeeId,
            timestamp: Date.now(),
            submittedAt: new Date().toISOString()
        });
        return { success: true };
    } catch (error) {
        console.error("Signup Submission Error:", error);
        throw error;
    }
}

/**
 * Subscribe to user's isActive status
 * @param {string} userId
 * @param {function} callback - Called with (isActive: boolean)
 * @returns {function} unsubscribe function
 */
export function subscribeToUserStatus(userId, callback) {
    const userStatusRef = ref(db, `users/${userId}/isActive`);
    return onValue(userStatusRef, (snapshot) => {
        const isActive = snapshot.exists() ? snapshot.val() : true; // Default to true if not set, or handle as needed
        callback(isActive);
    });
}


