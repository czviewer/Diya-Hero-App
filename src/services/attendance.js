import { ref, get, update, onValue } from 'firebase/database';
import { db, auth } from './firebaseConfig';
import { getServerTime, getServerISOString } from './timeManager';
import { DateTime } from 'luxon';
import { logActivityAsync, ActivityType } from './activityLog';

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
 */
export async function submitAttendance(userData, payload) {
    if (!userData || !userData.branch) throw new Error("User profile incomplete (missing branch).");

    const { dateString } = getCurrentTimeParts();
    const timestamp = getServerISOString();

    const dt = DateTime.fromISO(dateString, { zone: "Asia/Kolkata" });
    const year = String(dt.year);
    const month = String(dt.month).padStart(2, "0");
    const day = String(dt.day).padStart(2, "0");

    const attendancePath = `attendance/${year}/${month}/${day}/${userData.branch}/${userData.subdivision}/${userData.employeeId}`;
    const attendanceRef = ref(db, attendancePath);

    const finalPayload = {
        ...payload,
        timestamp, // Overall submission timestamp
        // Ensure critical fields are set if passed
    };

    await update(attendanceRef, finalPayload);

    // Log activity after successful submission (crash-proof)
    try {
        // Determine activity type based on payload
        let activityType = null;
        const metadata = {
            branch: userData.branch,
            subdivision: userData.subdivision,
            timestamp,
        };

        if (payload.anExit === true) {
            // Exit/Check-out
            activityType = ActivityType.CHECK_OUT;
            metadata.exitTime = payload.anExitTime || timestamp;
        } else if (payload.morning === true || payload.afternoon) {
            // Check-in (morning or afternoon)
            activityType = ActivityType.CHECK_IN;
            if (payload.morning) {
                metadata.type = 'morning';
                metadata.morningTime = payload.morningTime || timestamp;
            }
            if (payload.afternoon) {
                metadata.type = payload.afternoon === 'Enters' ? 'afternoon_enter' : 'afternoon_leave';
                metadata.afternoonStatus = payload.afternoon;
            }
        }

        // Log if we identified an activity type
        if (activityType) {
            logActivityAsync(activityType, metadata);
        }
    } catch (logError) {
        // Extra safety net - logging errors should never break attendance submission
        console.error('[Attendance] Activity logging error:', logError);
    }

    return true;
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
