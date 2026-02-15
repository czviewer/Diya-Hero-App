import * as Location from 'expo-location';
import { logActivityAsync, ActivityType } from './activityLog';

/**
 * Requests location permissions and returns the status.
 * @returns {Promise<boolean>} granted
 */
export async function requestLocationPermissions() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === 'granted';

    // Log permission result (crash-proof)
    if (!granted) {
        logActivityAsync(ActivityType.LOCATION_FAILURE, {
            reason: 'permission_denied',
            status
        });
    }

    return granted;
}

/**
 * Checks if location services are enabled on the device.
 */
export async function checkLocationServices() {
    try {
        const status = await Location.getProviderStatusAsync();
        console.log("Location Provider Status:", status);
        return status.locationServicesEnabled;
    } catch (e) {
        console.warn("Error checking location status:", e);
        return false;
    }
}

/**
 * Gets the current position with high accuracy.
 * @returns {Promise<Location.LocationObject | null>}
 */
export async function getCurrentLocation() {
    try {
        const servicesEnabled = await checkLocationServices();
        if (!servicesEnabled) {
            // Log location services disabled (crash-proof)
            logActivityAsync(ActivityType.LOCATION_FAILURE, {
                reason: 'services_disabled'
            });
            throw new Error("Location services are disabled. Please enable them in settings.");
        }

        const hasPermission = await requestLocationPermissions();
        if (!hasPermission) {
            console.warn("Location permission denied");
            // Permission denial already logged in requestLocationPermissions
            return null;
        }

        const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Highest, // Use Highest possible accuracy
            timeout: 20000, // Increased timeout to allow GPS to lock on
            maximumAge: 5000 // Reduced cache time (5s) for fresher data
        });



        return location;
    } catch (error) {
        // Log location retrieval failure (crash-proof)
        if (error.message !== "Location services are disabled. Please enable them in settings.") {
            logActivityAsync(ActivityType.LOCATION_FAILURE, {
                reason: 'retrieval_error',
                error: error.message
            });
        }

        console.error("Error getting location:", error);
        throw error; // Re-throw to be handled by caller
    }
}

/**
 * Calculates distance between two coordinates in meters (Haversine formula).
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}
