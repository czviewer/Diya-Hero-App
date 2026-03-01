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
 * @param {boolean} fastMode - If true, only uses cached location to avoid UI blocking.
 */
async function getQuickLocation(fastMode = false) {
    try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return null;

        // Try to get instant cached location first (very fast)
        let loc = await Location.getLastKnownPositionAsync();

        // If no cached location exists and we aren't restricted by fastMode, wait for a fresh one
        if (!loc && !fastMode) {
            loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
                timeout: 5000,
            });
        }

        if (loc) {
            return {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy,
            };
        }
        return null;
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

        // Fetch location for everything. Use fastMode for LOGOUT to prevent blocking the UI
        const isLogout = type === ActivityType.LOGOUT;
        const location = await getQuickLocation(isLogout);
        const deviceInfo = getDeviceInfo();

        // Merge distance/radius into location if provided in metadata for consistency
        const finalLocation = location ? {
            ...location,
            distance: metadata.distance ?? metadata.dist,
            radius: metadata.radius
        } : null;

        // Call Secure Cloud Function
        await mobile_logActivity({
            type,
            metadata: {
                ...metadata,
                source: 'MOBILE_APP',
                userRole: 'Employee'
            },
            location: finalLocation,
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
