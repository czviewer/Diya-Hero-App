/**
 * Time Manager - Centralized Server Time Synchronization
 * 
 * Synchronizes with Firebase Server Time to prevent device time manipulation.
 */

import { ref, onValue } from 'firebase/database';

let serverTimeOffset = 0;
let isInitialized = false;

/**
 * Initialize time synchronization with Firebase
 * @param {object} db - The Firebase Database instance
 */
export function initTimeSyncModular(db) {
    if (isInitialized) return;

    // .info/serverTimeOffset validation
    const offsetRef = ref(db, ".info/serverTimeOffset");
    onValue(offsetRef, (snap) => {
        serverTimeOffset = snap.val() || 0;
        console.log("⏱️ Server time offset synced:", serverTimeOffset, "ms");
    });

    isInitialized = true;
}

/**
 * Returns a Date object representing the current Server Time.
 * @returns {Date}
 */
export function getServerTime() {
    return new Date(Date.now() + serverTimeOffset);
}

/**
 * Returns the current Server Timestamp (ms).
 * @returns {number}
 */
export function getServerTimestamp() {
    return Date.now() + serverTimeOffset;
}

/**
 * Returns an ISO string of the current Server Time.
 * @returns {string}
 */
export function getServerISOString() {
    return new Date(Date.now() + serverTimeOffset).toISOString();
}

/**
 * Checks if the current server time is after a specific hour:minute in the local timezone.
 * @param {number} hour - 0-23
 * @param {number} minute - 0-59
 * @returns {boolean}
 */
export function isAfterTime(hour, minute = 0) {
    const serverNow = getServerTime();
    const currentHour = serverNow.getHours();
    const currentMinute = serverNow.getMinutes();

    if (currentHour > hour) return true;
    if (currentHour === hour && currentMinute >= minute) return true;
    return false;
}
