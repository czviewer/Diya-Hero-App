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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { calculateDistance } from './location';
import { logActivity, ActivityType } from './activityLog';
import {
    mobile_bindDevice,
    mobile_logSecurityEvent,
    mobile_updateSessionData,
    mobile_requestSignup,
    admin_sendPasswordResetEmail
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
export async function checkDeviceBinding(userUid, silent = false, location = null) {
    try {
        const currentDeviceId = await getDeviceId();
        // Server handles the check and set logic atomically
        const result = await mobile_bindDevice({
            deviceId: currentDeviceId,
            platform: Platform.OS,
            deviceInfo: getDeviceInfo(),
            silent: silent,
            location // GPS coordinates at time of bind check
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
                        timeout: 5000, // Increased from 1500ms to ensure location is captured (user requirement)
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
            } : null,
            source: 'MOBILE_APP',
            userRole: 'Employee'
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

        // 2. Fetch quick location silently (for device bind log)
        let loginLocation = null;
        try {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                    timeout: 5000,
                });
                loginLocation = {
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    accuracy: loc.coords.accuracy
                };
            }
        } catch (locErr) {
            // Silent - location is optional for bind log
        }

        // 3. Check Device Binding (Server-Side, silent=true — AppNavigator also checks)
        const bindingResult = await checkDeviceBinding(user.uid, true, loginLocation);

        if (!bindingResult.allowed) {
            console.log('[Auth] Device binding failed:', bindingResult.error);
            await firebaseSignOut(auth);
            throw new Error(bindingResult.error);
        }

        // 4. Calculate distance for login log if possible
        let loginDistance = undefined;
        let loginRadius = 200;
        if (snapshot.exists()) { // Use the userData from step 1
            const userData = snapshot.val();
            if (userData.branch && loginLocation) {
                try {
                    const branchSnap = await get(ref(db, `branches/${userData.branch}`));
                    if (branchSnap.exists()) {
                        const bData = branchSnap.val();
                        loginRadius = Number(bData.radius) || 100;
                        loginDistance = calculateDistance(
                            loginLocation.latitude,
                            loginLocation.longitude,
                            bData.latitude,
                            bData.longitude
                        );
                    }
                } catch (e) { console.log('[Auth] Login distance calc failed:', e); }
            }
        }


        // 5. Log successful login (Server-Side via wrapper)
        logActivity(ActivityType.LOGIN, {
            email,
            timestamp: new Date().toISOString(),
            distance: loginDistance !== undefined ? Math.round(loginDistance) : undefined,
            radius: loginRadius
        });

        // 6. Update session data (Server-Side)
        await updateUserSessionData(user.uid);

        // 7. Store Login Timestamp for Force Logout sync
        await AsyncStorage.setItem('lastLoginAt', Date.now().toString());

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

export async function logoutUser(location = null) {
    try {
        // Log logout (AWAITING execution to ensure it reaches server before Auth token is killed)
        await logActivity(ActivityType.LOGOUT, {
            timestamp: new Date().toISOString(),
            distance: location?.distance,
            radius: location?.radius
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
        // Silently fetch location for the signup log
        let signupLocation = null;
        try {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                    timeout: 5000,
                });
                signupLocation = {
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    accuracy: loc.coords.accuracy
                };
            }
        } catch (locErr) {
            // Silent - location is optional
        }

        // requestData: { name, email, password, phone, employeeId, pushToken }
        await mobile_requestSignup({
            ...requestData,
            deviceInfo: getDeviceInfo(),
            location: signupLocation,
            source: 'MOBILE_APP',
            userRole: 'Employee'
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
    const userRef = ref(db, `users/${userId}`);
    return onValue(userRef, (snapshot) => {
        const userData = snapshot.exists() ? snapshot.val() : {};
        callback(userData);
    });
}

/**
 * Sends a password reset email using the custom SMTP service.
 * @param {string} email - User's email address
 */
export async function sendMobilePasswordReset(email) {
    try {
        if (!email) throw new Error("Email is required.");

        await admin_sendPasswordResetEmail({ email });
        return { success: true };
    } catch (error) {
        console.error("[Auth] Password reset failed:", error.message);
        throw error;
    }
}


