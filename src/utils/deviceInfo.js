import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Common device information used for logging and tracking.
 * Extracted to avoid circular dependencies.
 */
export function getDeviceInfo() {
    return {
        brand: Device.brand || 'Unknown',
        modelName: Device.modelName || 'Unknown',
        deviceName: Device.deviceName || 'Unknown',
        osName: Device.osName || 'Unknown',
        osVersion: Device.osVersion || 'Unknown',
        platform: Platform.OS
    };
}
