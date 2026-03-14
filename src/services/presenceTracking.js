import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import { mobile_logPresence } from './cloudFunctions';

// Task name constant — must match the registration in App.js
export const PRESENCE_HEARTBEAT_TASK = 'PRESENCE_HEARTBEAT_TASK';

// Interval for background polling (15 minutes is the minimum Expo supports)
const HEARTBEAT_INTERVAL_SECONDS = 15 * 60; // 15 minutes

/**
 * Define the background task.
 * This MUST be called at the module level (imported by App.js at root),
 * not inside a component or useEffect.
 */
TaskManager.defineTask(PRESENCE_HEARTBEAT_TASK, async () => {
    console.log('[PresenceTracking] Heartbeat task fired');
    try {
        // Get current location (background)
        const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });

        if (!location || !location.coords) {
            console.warn('[PresenceTracking] No location available, skipping ping');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Call server — server will do geofence check and log IN/OUT
        const result = await mobile_logPresence({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
        });

        if (result?.skipped) {
            console.log('[PresenceTracking] Ping skipped —', result.reason);
        } else {
            console.log(`[PresenceTracking] Ping logged — status: ${result?.status}, distance: ${result?.distance}m`);
        }

        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (err) {
        // Non-fatal: background task errors must not crash the app
        console.warn('[PresenceTracking] Background task error:', err.message);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

/**
 * Start background presence tracking.
 * Call this after a successful Morning Punch.
 * Requires background location permission to be granted.
 */
export async function startPresenceTracking() {
    try {
        // Check background location permission
        const { status } = await Location.getBackgroundPermissionsAsync();
        if (status !== 'granted') {
            console.warn('[PresenceTracking] Background location permission not granted. Tracking skipped.');
            return false;
        }

        // Check if already registered
        const isRegistered = await TaskManager.isTaskRegisteredAsync(PRESENCE_HEARTBEAT_TASK);
        if (isRegistered) {
            console.log('[PresenceTracking] Task already registered. No action needed.');
            return true;
        }

        // Register the background fetch task
        await BackgroundFetch.registerTaskAsync(PRESENCE_HEARTBEAT_TASK, {
            minimumInterval: HEARTBEAT_INTERVAL_SECONDS,
            stopOnTerminate: false, // Continue even if app is killed
            startOnBoot: false,     // Don't auto-start on phone reboot
        });

        console.log('[PresenceTracking] Background heartbeat task started.');
        return true;
    } catch (err) {
        console.warn('[PresenceTracking] Failed to start tracking:', err.message);
        return false;
    }
}

/**
 * Stop background presence tracking.
 * Call this after a successful Exit Punch.
 */
export async function stopPresenceTracking() {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(PRESENCE_HEARTBEAT_TASK);
        if (!isRegistered) {
            return; // Already stopped
        }

        await BackgroundFetch.unregisterTaskAsync(PRESENCE_HEARTBEAT_TASK);
        console.log('[PresenceTracking] Background heartbeat task stopped.');
    } catch (err) {
        console.warn('[PresenceTracking] Failed to stop tracking:', err.message);
    }
}

/**
 * Check if presence tracking is currently active.
 */
export async function isPresenceTrackingActive() {
    try {
        return await TaskManager.isTaskRegisteredAsync(PRESENCE_HEARTBEAT_TASK);
    } catch {
        return false;
    }
}
