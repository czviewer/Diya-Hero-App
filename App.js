import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import UpdateModal from './src/components/UpdateModal';
import MaintenanceModal from './src/components/MaintenanceModal';
import LocationEnablerPopup from './src/components/LocationEnablerPopup';
import { setupNotificationListeners } from './src/services/notifications';
import { auth } from './src/services/firebaseConfig';
import { requestLocationPermissions } from './src/services/location';

export default function App() {
  // Request location permission on app launch
  useEffect(() => {
    requestLocationPermissions();
  }, []);

  useEffect(() => {
    async function checkUpdates() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          Alert.alert(
            'Update Available',
            'A new version of the app is available. Please restart to apply changes.',
            [
              {
                text: 'Restart',
                onPress: async () => {
                  await Updates.reloadAsync();
                },
              },
            ],
            { cancelable: false } // Force restart, user cannot dismiss
          );
        }
      } catch (e) {
        // Handle or log error - standard OTA failure case (e.g. no internet)
        console.log("OTA Error:", e);
        Alert.alert("OTA Error", `Failed to check for updates: ${e.message}`);
      }
    }

    checkUpdates();
  }, []);

  // Set up notification listeners on app launch
  useEffect(() => {
    const listeners = setupNotificationListeners();
    return () => listeners.remove();
  }, []);





  return (
    <SafeAreaProvider>
      <LocationEnablerPopup />
      <AppNavigator />
      <UpdateModal />
      <MaintenanceModal />
      <StatusBar style="dark" backgroundColor="transparent" translucent={true} />
    </SafeAreaProvider>
  );
}
