import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { auth } from './auth';
import { getPermissionsStatus } from './permissions';
import { getDeviceInfo } from '../utils/deviceInfo';
import { mobile_updatePushToken } from './cloudFunctions';



// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

/**
 * Request notification permissions from the user
 * @returns {Promise<boolean>} true if permission granted
 */
export async function requestNotificationPermissions() {
    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('Notification permission denied');
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error requesting notification permissions:', error);
        return false;
    }
}

/**
 * Register for push notifications and store token in Firebase
 * @param {string} userId - Optional User ID to ensure token is stored for the right account
 * @returns {Promise<string|null>} Expo push token or null if failed
 */
export async function registerForPushNotifications(userId = null) {
    try {
        // Check if running on physical device
        if (!Device.isDevice) {
            console.log('🔔 [PUSH] Push notifications only work on physical devices (Simulator/Emulator detected)');
            return null;
        }

        // Request permissions
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
            console.log('🔔 [PUSH] No permission for notifications');
            return null;
        }

        // Configure Android notification channel
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Attendance Reminders',
                description: 'Important reminders for check-in and check-out',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#6366f1',
                sound: 'default',
                enableLights: true,
                enableVibrate: true,
                showBadge: true,
                bypassDnd: true,
            });
        }

        // Get Expo push token
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) {
            console.error('🔔 [PUSH] Project ID not found in app.json');
            return null;
        }

        const pushTokenData = await Notifications.getExpoPushTokenAsync({
            projectId,
        });

        const pushToken = pushTokenData.data;
        console.log('🔔 [PUSH] Token generated:', pushToken);

        // Store token in Firebase user node
        const currentUserId = userId || auth.currentUser?.uid;
        if (currentUserId) {
            await storePushTokenInFirebase(currentUserId, pushToken);
        } else {
            console.log('🔔 [PUSH] No user logged in, cannot store token yet.');
        }

        return pushToken;
    } catch (error) {
        console.error('🔔 [PUSH] ❌ Error registering for push notifications:', error);
        return null;
    }
}

/**
 * Get push token for signup request (auth-independent)
 * @returns {Promise<string|null>} Expo push token or null
 */
export async function getPushTokenForSignup() {
    try {
        if (!Device.isDevice) return null;

        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) return null;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Attendance Reminders',
                description: 'Important reminders for check-in and check-out',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#6366f1',
                sound: 'default',
                enableLights: true,
                enableVibrate: true,
                showBadge: true,
                bypassDnd: true,
            });
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return null;

        const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        return pushTokenData.data;
    } catch (error) {
        console.error('Error getting signup push token:', error);
        return null;
    }
}

/**
 * Store push token in Firebase user node
 * @param {string} userId - User ID
 * @param {string} pushToken - Expo push token
 */
async function storePushTokenInFirebase(userId, pushToken) {
    try {
        console.log(`🔔 [PUSH] Storing token for user: ${userId}`);
        const permissions = await getPermissionsStatus();
        const deviceInfo = getDeviceInfo();

        await mobile_updatePushToken({
            pushToken: pushToken,
            permissions: permissions,
            source: 'MOBILE_APP',
            deviceInfo: {
                ...deviceInfo,
                permissions: permissions
            },
        });
        console.log('🔔 [PUSH] ✅ Push token stored successfully via Cloud Function');
    } catch (error) {
        console.error('🔔 [PUSH] ❌ Error storing push token in Firebase:', error);
    }
}

/**
 * Set up notification listeners
 * @returns {Object} Object with cleanup functions
 */
export function setupNotificationListeners() {
    // Listener for notifications received while app is in foreground
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification received in foreground:', notification);
        // You can show custom in-app notification here if needed
    });

    // Listener for when user taps on a notification
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification tapped:', response);
        const data = response.notification.request.content.data;

        // Handle navigation based on notification data
        if (data.screen) {
            // Navigate to specific screen
            console.log('Navigate to:', data.screen);
            // TODO: Implement navigation logic
        }
    });

    // Return cleanup function
    return {
        remove: () => {
            Notifications.removeNotificationSubscription(notificationListener);
            Notifications.removeNotificationSubscription(responseListener);
        },
    };
}



/**
 * Clear all notifications
 */
export async function clearAllNotifications() {
    try {
        await Notifications.dismissAllNotificationsAsync();
        console.log('All notifications cleared');
    } catch (error) {
        console.error('Error clearing notifications:', error);
    }
}

/**
 * Get notification badge count
 * @returns {Promise<number>} Badge count
 */
export async function getBadgeCount() {
    try {
        const count = await Notifications.getBadgeCountAsync();
        return count;
    } catch (error) {
        console.error('Error getting badge count:', error);
        return 0;
    }
}

/**
 * Set notification badge count
 * @param {number} count - Badge count
 */
export async function setBadgeCount(count) {
    try {
        await Notifications.setBadgeCountAsync(count);
        console.log('Badge count set to:', count);
    } catch (error) {
        console.error('Error setting badge count:', error);
    }
}
