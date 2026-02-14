import { isMockingLocation } from 'react-native-turbo-mock-location-detector';
import { checkVpn } from 'expo-vpn-checker';
import JailMonkey from 'jail-monkey';
import { calculateDistance } from './location';

// Store last known location for jump analysis
let lastKnownLocation = null;
let lastLocationTimestamp = null;

/**
 * Check if device is using mock/fake GPS location
 * @param {Object} location - The location object from expo-location
 * @returns {Promise<boolean>} true if mock location detected
 */
export async function checkMockLocation(location = null) {
    try {
        // 1. Check native 'mocked' property from Expo (Android only)
        // This is the GOLD STANDARD - it's true only if the OS knows THIS location is faked.
        if (location && (location.mocked === true || location.coords?.mocked === true)) {
            console.log('Mock location detected via native system flag');
            return { isMocked: true, source: 'System' };
        }

        // 2. Check via JailMonkey's isMockLocation (Checks if a mock provider is ACTIVE)
        // This is more specific than canMockLocation()
        if (JailMonkey.isMockLocation && JailMonkey.isMockLocation()) {
            console.log('Mock location provider detected as active via JailMonkey');
            return { isMocked: true, source: 'Provider' };
        }

        // Note: turbo-detector removed as it was causing false positives
        // and requires native rebuild to be available

        return { isMocked: false };
    } catch (error) {
        console.warn('Mock location check failed:', error);
        return { isMocked: false }; // Fail open
    }
}

/**
 * Check if device is using VPN connection
 * @returns {Promise<boolean>} true if VPN detected
 */
export async function checkVPN() {
    try {
        // Check if native module is available
        if (!checkVpn) {
            console.warn('VPN checker native module not available - requires rebuild');
            return false;
        }
        const isVpnActive = await checkVpn();
        return isVpnActive;
    } catch (error) {
        console.warn('VPN check failed:', error);
        return false; // Fail open - don't block if check fails
    }
}

/**
 * Check if device is rooted/jailbroken or compromised
 * @returns {boolean} true if device integrity is compromised
 */
export function checkDeviceIntegrity() {
    try {
        // Check if device is jailbroken/rooted
        const isJailBroken = JailMonkey.isJailBroken();

        // Check if running on emulator (optional - may block legitimate testing)
        // const isOnEmulator = JailMonkey.isOnExternalStorage();

        // Check if debugger is attached (optional - may block development)
        // const isDebuggedMode = JailMonkey.isDebuggedMode();

        return isJailBroken;
    } catch (error) {
        console.warn('Device integrity check failed:', error);
        return false; // Fail open
    }
}

/**
 * Analyze location jump to detect unrealistic movement
 * @param {Object} currentLocation - Current location object with coords
 * @returns {Object} { isUnrealistic: boolean, speed: number, message: string }
 */
export function analyzeLocationJump(currentLocation) {
    if (!currentLocation || !currentLocation.coords) {
        return { isUnrealistic: false, speed: 0, message: 'No location data' };
    }

    // First location - store and allow
    if (!lastKnownLocation || !lastLocationTimestamp) {
        lastKnownLocation = currentLocation;
        lastLocationTimestamp = Date.now();
        return { isUnrealistic: false, speed: 0, message: 'First location recorded' };
    }

    const currentTime = Date.now();
    const timeDiffSeconds = (currentTime - lastLocationTimestamp) / 1000;

    // If less than 5 seconds, skip check (too soon to determine)
    if (timeDiffSeconds < 5) {
        return { isUnrealistic: false, speed: 0, message: 'Too soon to analyze' };
    }

    // Calculate distance in meters
    const distance = calculateDistance(
        lastKnownLocation.coords.latitude,
        lastKnownLocation.coords.longitude,
        currentLocation.coords.latitude,
        currentLocation.coords.longitude
    );

    // Calculate speed in km/h
    const speedKmh = (distance / 1000) / (timeDiffSeconds / 3600);

    // Update last known location
    lastKnownLocation = currentLocation;
    lastLocationTimestamp = currentTime;

    // Threshold: 200 km/h (very generous to avoid false positives)
    // Even fastest trains/cars rarely exceed this in normal attendance scenarios
    const MAX_REALISTIC_SPEED = 200;

    if (speedKmh > MAX_REALISTIC_SPEED) {
        return {
            isUnrealistic: true,
            speed: speedKmh,
            message: `Unrealistic movement detected: ${speedKmh.toFixed(0)} km/h`
        };
    }

    return {
        isUnrealistic: false,
        speed: speedKmh,
        message: `Normal movement: ${speedKmh.toFixed(1)} km/h`
    };
}

/**
 * Reset location jump tracking (call on app restart or logout)
 */
export function resetLocationTracking() {
    lastKnownLocation = null;
    lastLocationTimestamp = null;
}

/**
 * Perform comprehensive security checks
 * @param {Object} currentLocation - Current location object
 * @returns {Promise<Object>} Security status object
 */
export async function performSecurityChecks(currentLocation = null) {
    const results = {
        isSafe: true,
        threats: [],
        details: {}
    };

    try {
        // 1. Check for mock location
        const mockCheck = await checkMockLocation(currentLocation);
        results.details.mockLocation = mockCheck.isMocked;
        if (mockCheck.isMocked) {
            results.isSafe = false;
            results.threats.push({
                type: 'MOCK_GPS',
                severity: 'HIGH',
                message: `Fake GPS detected (${mockCheck.source}). Please disable mock location apps.`
            });
        }

        // 2. Check for VPN
        const isVpn = await checkVPN();
        results.details.vpn = isVpn;
        if (isVpn) {
            results.isSafe = false;
            results.threats.push({
                type: 'VPN',
                severity: 'MEDIUM',
                message: 'VPN detected. Please disconnect VPN to mark attendance.'
            });
        }

        // 3. Check device integrity
        const isCompromised = checkDeviceIntegrity();
        results.details.deviceCompromised = isCompromised;
        if (isCompromised) {
            results.isSafe = false;
            results.threats.push({
                type: 'ROOTED_DEVICE',
                severity: 'HIGH',
                message: 'Device security compromised. Attendance not allowed on rooted/jailbroken devices.'
            });
        }

        // 4. Analyze location jump (if location provided)
        if (currentLocation) {
            const jumpAnalysis = analyzeLocationJump(currentLocation);
            results.details.locationJump = jumpAnalysis;
            if (jumpAnalysis.isUnrealistic) {
                results.isSafe = false;
                results.threats.push({
                    type: 'LOCATION_JUMP',
                    severity: 'HIGH',
                    message: jumpAnalysis.message
                });
            }
        }

    } catch (error) {
        console.error('Security checks failed:', error);
        // Fail open - allow operation if checks fail
        results.isSafe = true;
        results.threats = [];
        results.error = error.message;
    }

    return results;
}
