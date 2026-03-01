import { ref, query, orderByChild, equalTo, onValue } from 'firebase/database';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { db } from './firebaseConfig';
import { mobile_submitIssue } from './cloudFunctions';

/**
 * Submit a new issue to Firebase
 * @param {Object} userData - User data from Firebase (must include uid, name, email, branch)
 * @param {Object} issueData - Issue data containing category, subject, description
 * @returns {Promise<string>} - Returns the issue ID
 */
/**
 * Submit a new issue to Firebase
 * REPLACED: Uses secure Cloud Function 'mobile_submitIssue'
 */
export const submitIssue = async (userData, issueData, location = null) => {
    try {
        if (!userData || !userData.uid) {
            throw new Error('User data is required to submit an issue');
        }

        if (!issueData.category || !issueData.subject || !issueData.description) {
            throw new Error('Category, subject, and description are required');
        }

        const result = await mobile_submitIssue({
            category: issueData.category,
            subject: issueData.subject,
            description: issueData.description,
            userData: {
                name: userData.name,
                email: userData.email,
                branch: userData.branch
            },
            location, // GPS coordinates at time of issue submission
            deviceInfo: {
                brand: Device.brand,
                modelName: Device.modelName,
                osName: Device.osName,
                osVersion: Device.osVersion,
                platform: Platform.OS,
                appVersion: Application.nativeApplicationVersion || '1.0.0'
            }
        });

        return result.issueId;
    } catch (error) {
        console.error('[issueService] Error submitting issue:', error);
        throw error;
    }
};

/**
 * Issue categories available for selection
 */
export const ISSUE_CATEGORIES = [
    { label: 'Login Issues', value: 'login' },
    { label: 'Attendance Issues', value: 'attendance' },
    { label: 'Location Issues', value: 'location' },
    { label: 'App Bugs', value: 'bug' },
    { label: 'Feature Request', value: 'feature' },
    { label: 'Other', value: 'other' }
];

/**
 * Subscribe to real-time updates for all issues submitted by a specific user
 * @param {string} userId - The user's Firebase UID
 * @param {Function} callback - Callback function that receives the array of issues
 * @returns {Function} - Unsubscribe function
 */
export const subscribeToUserIssues = (userId, callback) => {
    try {
        if (!userId) {
            throw new Error('User ID is required to subscribe to issues');
        }

        const issuesRef = ref(db, 'issues');
        const userIssuesQuery = query(issuesRef, orderByChild('userId'), equalTo(userId));

        const unsubscribe = onValue(userIssuesQuery, (snapshot) => {
            const issuesArray = [];

            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    issuesArray.push({
                        ...childSnapshot.val(),
                        id: childSnapshot.key
                    });
                });
            }

            // Sort by updatedAt (most recent first)
            issuesArray.sort((a, b) => {
                const dateA = new Date(a.updatedAt || a.createdAt);
                const dateB = new Date(b.updatedAt || b.createdAt);
                return dateB - dateA; // Descending order
            });

            callback(issuesArray);
        }, (error) => {
            console.error('[issueService] Error subscribing to user issues:', error);
            callback([]); // Return empty array on error
        });

        return unsubscribe;
    } catch (error) {
        console.error('[issueService] Error setting up subscription:', error);
        return () => { }; // Return no-op unsubscribe function
    }
};

