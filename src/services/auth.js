import {
    signInWithEmailAndPassword,
    signOut as firebaseSignOut
} from 'firebase/auth';
import { ref, get, onValue } from 'firebase/database';
import { auth, db } from './firebaseConfig';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { logActivity, ActivityType } from './activityLog';
import {
    mobile_bindDevice,
    mobile_logSecurityEvent,
    mobile_updateSessionData,
    mobile_requestSignup
} from './cloudFunctions';

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

export function getDeviceInfo() {
    return {
        brand: Device.brand,
        modelName: Device.modelName,
        osName: Device.osName,
        osVersion: Device.osVersion,
        platform: Platform.OS,
        appVersion: Application.nativeApplicationVersion || '1.0.0'
    };
}

/**
 * Checks if the current device is bound to the user's account.
 * REPLACED: Uses secure Cloud Function 'mobile_bindDevice'
 */
export async function checkDeviceBinding(userUid, silent = false) {
    try {
        const currentDeviceId = await getDeviceId();
        // Server handles the check and set logic atomically
        const result = await mobile_bindDevice({
            deviceId: currentDeviceId,
            platform: Platform.OS,
            deviceInfo: getDeviceInfo(),
            silent: silent
        });

        return result; // { allowed: boolean, error?: string }
    } catch (error) {
        // console.error('[Auth] Device binding check failed:', error); // Prevent double logging
        return { allowed: false, error: "Unable to verify device binding. Please try again." };
    }
}

/**
 * Logs an unauthorized access attempt to Firebase
 * REPLACED: Uses secure Cloud Function 'mobile_logSecurityEvent'
 */
export async function logUnauthorizedAttempt(userId, email, reason) {
    try {
        const deviceId = await getDeviceId();

        // Silently fetch location for the log - PRIORITIZE SPEED
        let location = null;
        try {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status === 'granted') {
                location = await Location.getLastKnownPositionAsync();
                if (!location) {
                    location = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced,
                        timeout: 1500,
                    });
                }
            }
        } catch (locErr) {
            // Silent - location is optional
        }

        // Send to Server
        await mobile_logSecurityEvent({
            userId, // Note: Function might ignore this if unauth, but good to send
            email: email || 'unknown',
            reason,
            deviceId,
            location: location ? {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy
            } : null
        });

    } catch (logError) {
        console.error('[Auth] Failed to log unauthorized attempt:', logError);
    }
}

export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 1. Check if account is active (Read-only, safe to keep client-side for speed)
        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
            const userData = snapshot.val();
            if (userData.isActive === false) {
                await firebaseSignOut(auth);
                throw new Error("Your account has been deactivated. Please contact your administrator.");
            }
        }

        // 2. Check Device Binding (Server-Side)
        const bindingResult = await checkDeviceBinding(user.uid, true);

        if (!bindingResult.allowed) {
            console.log('[Auth] Device binding failed:', bindingResult.error);
            await firebaseSignOut(auth);
            throw new Error(bindingResult.error);
        }

        // 3. Log successful login (Server-Side via wrapper)
        logActivity(ActivityType.LOGIN, {
            email,
            timestamp: new Date().toISOString()
        });

        // 4. Update session data (Server-Side)
        await updateUserSessionData(user.uid);

        return userCredential.user;
    } catch (error) {
        console.error('[Auth] loginUser error:', error.message);
        throw error;
    }
}

/**
 * Updates user session data including App Version and Permissions
 * REPLACED: Uses secure Cloud Function 'mobile_updateSessionData'
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

        // Send to Server - Server handles "only update if changed" logic to save cost/writes
        await mobile_updateSessionData({
            appVersion: {
                versionName: version,
                versionCode: build
            },
            permissions: {
                notifications: notifStatus,
                location: locStatus
            }
        });

    } catch (error) {
        console.error('[Auth] Failed to update session data:', error);
    }
}

export async function logoutUser() {
    try {
        // Log logout (AWAITING execution to ensure it reaches server before Auth token is killed)
        await logActivity(ActivityType.LOGOUT, {
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Auth] Logout logging failed:', error);
    }

    return firebaseSignOut(auth);
}

/**
 * Submit Signup Request
 * REPLACED: Uses secure Cloud Function 'mobile_requestSignup'
 */
export async function submitSignupRequest(requestData) {
    try {
        // requestData: { name, email, password, phone, employeeId, pushToken }
        await mobile_requestSignup({
            ...requestData,
            deviceInfo: getDeviceInfo()
        });
        return { success: true };
    } catch (error) {
        console.error("Signup Submission Error:", error);
        throw error;
    }
}

/**
 * Subscribe to user's isActive status
 * Read-only listener, safe to keep.
 */
export function subscribeToUserStatus(userId, callback) {
    const userStatusRef = ref(db, `users/${userId}/isActive`);
    return onValue(userStatusRef, (snapshot) => {
        const isActive = snapshot.exists() ? snapshot.val() : true;
        callback(isActive);
    });
}


