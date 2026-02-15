import { mobile_logActivity } from './cloudFunctions';
import { auth } from './firebaseConfig'; // Keep auth to check current user
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
    LOCATION_SUCCESS_IN: 'LOCATION_SUCCESS_IN',
    LOCATION_SUCCESS_OUT: 'LOCATION_SUCCESS_OUT',
};

/**
 * Get device information for logging context
 */
function getDeviceInfo() {
    try {
        return {
            platform: Platform.OS,
            osVersion: Device.osVersion || 'unknown',
            modelName: Device.modelName || 'unknown',
        };
    } catch (error) {
        return {
            platform: Platform.OS || 'unknown',
            osVersion: 'unknown',
            modelName: 'unknown',
        };
    }
}

/**
 * Silently fetch current GPS coordinates for logging.
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
        return null;
    }
}

/**
 * Log a user activity to Firebase (via Cloud Function)
 */
export async function logActivity(type, metadata = {}) {
    try {
        const user = auth.currentUser;
        if (!user) return false;

        // OPTIMIZATION: Skip location for LOGOUT to ensure it sends before auth token dies
        let location = null;
        if (type !== ActivityType.LOGOUT) {
            location = await getQuickLocation();
        }
        const deviceInfo = getDeviceInfo();

        // Call Secure Cloud Function
        await mobile_logActivity({
            type,
            metadata,
            location,
            deviceInfo
        });

        return true;
    } catch (error) {
        console.error('[ActivityLog] Failed to log activity:', error.message);
        return false;
    }
}

/**
 * Fire-and-forget wrapper
 */
export function logActivityAsync(type, metadata = {}) {
    logActivity(type, metadata).catch(err => console.error(err));
}
