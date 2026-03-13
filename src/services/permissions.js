import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';

/**
 * Fetches the current status of location and notification permissions.
 * @returns {Promise<Object>} Status of permissions
 */
export async function getPermissionsStatus() {
    let notifStatus = 'unknown';
    try {
        const { status } = await Notifications.getPermissionsAsync();
        notifStatus = status;
    } catch (e) {
        console.log('Error fetching notification status:', e);
    }

    let locStatus = 'unknown';
    try {
        const { status } = await Location.getForegroundPermissionsAsync();
        locStatus = status;
    } catch (e) {
        console.log('Error fetching location status:', e);
    }

    return {
        notifications: notifStatus,
        location: locStatus
    };
}
