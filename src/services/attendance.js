import { ref, get, onValue } from 'firebase/database';
import { db, auth } from './firebaseConfig';
import { getServerTime, getServerISOString } from './timeManager';
import { DateTime } from 'luxon';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { mobile_submitAttendance } from './cloudFunctions';

/**
 * Normalizes the afternoon status.
 */
export function normalizeAfternoon(status) {
    return status === null || status === undefined ? "None" : status;
}

/**
 * Fetches today's attendance for the current user.
 */
export async function fetchTodayAttendance(userData) {
    if (!userData || !userData.branch || !userData.subdivision || !userData.employeeId) {
        return null;
    }

    const { dateString } = getCurrentTimeParts();

    // Attendance Path Construction
    const dt = DateTime.fromISO(dateString, { zone: "Asia/Kolkata" });
    const year = String(dt.year);
    const month = String(dt.month).padStart(2, "0");
    const day = String(dt.day).padStart(2, "0");

    const attendancePath = `attendance/${year}/${month}/${day}/${userData.branch}/${userData.subdivision}/${userData.employeeId}`;
    const attendanceRef = ref(db, attendancePath);

    try {
        const snapshot = await get(attendanceRef);
        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        console.error("Error fetching attendance:", error);
        return null;
    }
}

/**
 * Subscribes to today's attendance updates.
 * @param {object} userData - User data
 * @param {function} onData - Callback with data or null
 * @returns {function} unsubscribe function
 */
export function subscribeToTodayAttendance(userData, onData) {
    if (!userData || !userData.branch || !userData.subdivision || !userData.employeeId) {
        if (onData) onData(null);
        return () => { };
    }

    const { dateString } = getCurrentTimeParts();

    // Attendance Path Construction
    const dt = DateTime.fromISO(dateString, { zone: "Asia/Kolkata" });
    const year = String(dt.year);
    const month = String(dt.month).padStart(2, "0");
    const day = String(dt.day).padStart(2, "0");

    const attendancePath = `attendance/${year}/${month}/${day}/${userData.branch}/${userData.subdivision}/${userData.employeeId}`;
    const attendanceRef = ref(db, attendancePath);

    const unsubscribe = onValue(attendanceRef, (snapshot) => {
        const val = snapshot.exists() ? snapshot.val() : null;
        if (onData) onData(val);
    }, (error) => {
        console.error("Error subscribing to attendance:", error);
    });

    return unsubscribe;
}

/**
 * Returns current date/time parts based on Server Time.
 */
export function getCurrentTimeParts() {
    const now = getServerTime();
    const dateString = now.toISOString().slice(0, 10);
    const hour = now.getHours();
    const minute = now.getMinutes();
    return { dateString, hour, minute };
}

/**
 * Validates and submits attendance.
 * REPLACED: Uses secure Cloud Function 'mobile_submitAttendance'
 */
function getDeviceInfo() {
    return {
        brand: Device.brand,
        modelName: Device.modelName,
        osName: Device.osName,
        osVersion: Device.osVersion,
        platform: Platform.OS,
        appVersion: Application.nativeApplicationVersion || '1.0.0'
    };
}

export async function submitAttendance(userData, payload) {
    if (!userData || !userData.branch) throw new Error("User profile incomplete (missing branch).");

    try {
        await mobile_submitAttendance({
            branch: userData.branch,
            subdivision: userData.subdivision,
            payload: {
                ...payload,
                deviceInfo: getDeviceInfo()
            }
        });

        // NOTE: We don't need to manually log activity anymore.
        // The Cloud Function handles logging atomically.

        return true;
    } catch (error) {
        console.error("Error submitting attendance:", error);
        throw error;
    }
}

/**
 * Determines which controls should be enabled based on time and current state.
 * @returns {object} { morningEnabled, afternoonEnabled, exitEnabled, error }
 */
export function getAttendanceState(todayAttendance, hour, minute) {
    const state = {
        morningEnabled: false,
        afternoonEnabled: false,
        exitEnabled: false,
        message: null,
        isExitWindow: false
    };

    const morningLocked = todayAttendance?.morningLocked === true;
    const anLocked = todayAttendance?.anLocked === true;
    const anExitMarked = todayAttendance?.anExit === true;

    // Morning Window: 8:00 - 12:00
    if (!morningLocked && hour >= 8 && hour < 12) {
        state.morningEnabled = true;
    }

    // Afternoon Window: 12:00 - 15:00
    if (!anLocked && hour >= 12 && hour < 15) {
        state.afternoonEnabled = true;
    }

    // Exit Window: 15:00 - 23:30
    const isExitWindow = (hour >= 15 && hour <= 23) && (hour < 23 || (hour === 23 && minute <= 30));
    state.isExitWindow = isExitWindow;

    if (anExitMarked) {
        state.message = "Attendance for today is finalized.";
    } else if (isExitWindow) {
        // Logic for enabling exit based on previous states is handled in UI or pre-submission check
        // But strictly here:
        const morningDone = todayAttendance?.morning === true;
        const afternoonStatus = normalizeAfternoon(todayAttendance?.afternoon);

        const canEnableExit = (morningDone && afternoonStatus === 'None') || (!morningDone && afternoonStatus === 'Enters');

        if (canEnableExit) {
            state.exitEnabled = true;
        }
    }

    return state;
}
