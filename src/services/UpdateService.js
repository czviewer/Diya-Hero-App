// Use legacy API as per SDK 54 deprecation warning for downloadAsync/createDownloadResumable
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { ref, get, onValue } from 'firebase/database';
import { db } from './firebaseConfig';

export const checkForUpdate = async () => {
    try {
        if (Platform.OS !== 'android') return null;

        // Fetch config from Firebase Realtime Database
        const snapshot = await get(ref(db, 'config/appUpdate'));

        if (!snapshot.exists()) {
            console.log("UpdateService: Config not found in DB");
            return null;
        }

        const config = snapshot.val();

        const currentVersion = Application.nativeApplicationVersion || '1.0.0';

        console.log(`UpdateService: Checking. Server: ${config.latestVersion}, App: ${currentVersion}`);

        // Simple semantic version compare (assumes x.y.z format)
        if (compareVersions(config.latestVersion, currentVersion) > 0) {
            console.log("UpdateService: Update available!");
            return config;
        }
        console.log("UpdateService: App is up to date.");
        return null;
    } catch (error) {
        console.warn("Update check failed:", error);
        return null;
    }
};

export const subscribeToUpdates = (callback) => {
    if (Platform.OS !== 'android') return () => { };

    const updateRef = ref(db, 'config/appUpdate');
    return onValue(updateRef, (snapshot) => {
        if (!snapshot.exists()) {
            callback(null);
            return;
        }

        const config = snapshot.val();
        const currentVersion = Application.nativeApplicationVersion || '1.0.0';

        if (compareVersions(config.latestVersion, currentVersion) > 0) {
            callback(config);
        } else {
            callback(null);
        }
    });
};

export const downloadUpdate = async (url, onProgress) => {
    try {
        const timestamp = new Date().getTime();
        const fileUri = `${FileSystem.documentDirectory}update_${timestamp}.apk`;

        const downloadResumable = FileSystem.createDownloadResumable(
            url,
            fileUri,
            {},
            (downloadProgress) => {
                const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                if (onProgress) onProgress(progress);
            }
        );

        const result = await downloadResumable.downloadAsync();
        return result.uri;
    } catch (error) {
        console.error("Download failed:", error);
        throw error;
    }
};

export const installUpdate = async (fileUri) => {
    try {
        const contentUri = await FileSystem.getContentUriAsync(fileUri);

        if (Platform.OS === 'android') {
            try {
                // Try Native Intent first (Needs REQUEST_INSTALL_PACKAGES permission)
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: contentUri,
                    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                    type: 'application/vnd.android.package-archive',
                });
            } catch (intentError) {
                console.warn("Intent failed, falling back to Sharing:", intentError);
                // Fallback immediately if intent fails
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri);
                } else {
                    Alert.alert("Error", "Could not install update.");
                }
            }
        }
    } catch (error) {
        console.error("Install failed:", error);
        Alert.alert("Install Error", error.message);
        // Retry with sharing on general error
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri);
        }
    }
};

// Helper: 1.0.1 > 1.0.0
export const compareVersions = (v1, v2) => {
    // Ensure inputs are strings
    const s1 = String(v1);
    const s2 = String(v2);

    const p1 = s1.split('.').map(Number);
    const p2 = s2.split('.').map(Number);

    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
};
