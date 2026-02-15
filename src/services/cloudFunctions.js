import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebaseConfig';

const functions = getFunctions(app, 'asia-southeast1');

/**
 * Wrapper for calling Cloud Functions securely
 * @param {string} functionName - Name of the function to call
 * @param {object} data - Payload to send
 * @returns {Promise<any>} - Result data
 */
const callFunction = async (functionName, data = {}) => {
    try {
        const fn = httpsCallable(functions, functionName);
        const result = await fn(data);
        return result.data;
    } catch (error) {
        console.error(`[CloudFunctions] Error calling ${functionName}:`, error);
        throw error;
    }
};

// Export individual functions for easier usage
export const mobile_logActivity = (data) => callFunction('mobile_logActivity', data);
export const mobile_logSecurityEvent = (data) => callFunction('mobile_logSecurityEvent', data);
export const mobile_submitAttendance = (data) => callFunction('mobile_submitAttendance', data);
export const mobile_bindDevice = (data) => callFunction('mobile_bindDevice', data);
export const mobile_updateSessionData = (data) => callFunction('mobile_updateSessionData', data);
export const mobile_submitIssue = (data) => callFunction('mobile_submitIssue', data);
export const mobile_requestSignup = (data) => callFunction('mobile_requestSignup', data);
