import { ref, push, set } from 'firebase/database';
import { db, auth } from './firebaseConfig';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Location from 'expo-location';

/**
 * Activity types that can be logged
 */
export const ActivityType = {
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    DEVICE_BIND: 'DEVICE_BIND',
    CHECK_IN: 'CHECK_IN',
    CHECK_OUT: 'CHECK_OUT',
    LOCATION_FAILURE: 'LOCATION_FAILURE',
    LOCATION_SUCCESS: 'LOCATION_SUCCESS',
};

/**
 * Get device information for logging context
 * @returns {object} Device information
 */
function getDeviceInfo() {
    try {
        return {
            platform: Platform.OS,
            osVersion: Device.osVersion || 'unknown',
            modelName: Device.modelName || 'unknown',
        };
    } catch (error) {
        // Silent failure - return minimal info
        console.error('[ActivityLog] Error getting device info:', error);
        return {
            platform: Platform.OS || 'unknown',
            osVersion: 'unknown',
            modelName: 'unknown',
        };
    }
}

/**
 * Silently fetch current GPS coordinates for logging.
 * - Never throws
 * - Returns { latitude, longitude, accuracy } or null
 */
async function getQuickLocation() {
    try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return null;

        const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 5000,
        });
        return {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
        };
    } catch (error) {
        // Silent failure - location is optional for logs
        console.warn('[ActivityLog] Quick location failed:', error.message);
        return null;
    }
}

/**
 * Log a user activity to Firebase
 * 
 * This function is crash-proof:
 * - Never throws exceptions
 * - Fails silently if Firebase write fails
 * - Logs errors to console for debugging
 * - Returns immediately without blocking
 * - Automatically attaches GPS coordinates to every log
 * 
 * @param {string} type - Activity type from ActivityType enum
 * @param {object} metadata - Activity-specific data (optional)
 * @returns {Promise<boolean>} - true if logged successfully, false otherwise
 */
export async function logActivity(type, metadata = {}) {
    try {
        // Get current user
        const user = auth.currentUser;
        if (!user) {
            console.warn('[ActivityLog] No user logged in, skipping log');
            return false;
        }

        const userId = user.uid;

        // Fetch location silently (never blocks or throws)
        const location = await getQuickLocation();

        // Create activity object
        const activity = {
            type,
            timestamp: new Date().toISOString(),
            metadata,
            deviceInfo: getDeviceInfo(),
            location, // { latitude, longitude, accuracy } or null
        };

        // Generate path: userActivities/{userId}/{autoId}
        const activitiesRef = ref(db, `userActivities/${userId}`);
        const newActivityRef = push(activitiesRef);

        // Write to Firebase (async, non-blocking)
        await set(newActivityRef, activity);

        return true;
    } catch (error) {
        // Silent failure - log to console but never throw
        console.error('[ActivityLog] Failed to log activity:', {
            type,
            error: error.message,
        });
        return false;
    }
}

/**
 * Log activity without waiting for completion (fire-and-forget)
 * Use this when you want to ensure the app continues immediately
 * 
 * @param {string} type - Activity type from ActivityType enum
 * @param {object} metadata - Activity-specific data (optional)
 */
export function logActivityAsync(type, metadata = {}) {
    // Fire and forget - don't await
    logActivity(type, metadata).catch((error) => {
        // Extra safety net - should never reach here due to internal try-catch
        console.error('[ActivityLog] Unexpected error in async log:', error);
    });
}
