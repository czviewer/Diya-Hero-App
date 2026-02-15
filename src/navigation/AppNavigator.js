import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View, Alert } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { checkDeviceBinding, subscribeToUserStatus, logoutUser } from '../services/auth';

// Screens
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import PhoneVerifyScreen from '../screens/Auth/PhoneVerifyScreen';
import HomeScreen from '../screens/Dashboard/HomeScreen';
import IssueReportingScreen from '../screens/Dashboard/IssueReportingScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) {
                // 1. Block UI until Device Binding is Verified
                try {
                    const binding = await checkDeviceBinding(u.uid);
                    if (!binding.allowed) {
                        console.log('[Navigator] Binding check failed, forcing logout.');

                        // Log the unauthorized attempt - ALREADY LOGGED BY mobile_bindDevice
                        // const { logUnauthorizedAttempt } = require('../services/auth');
                        // await logUnauthorizedAttempt(u.uid, u.email, binding.allowed ? 'Unknown' : binding.error);

                        await logoutUser();
                        setUser(null);
                        setLoading(false);
                        return; // Stop here
                    }

                    // 2. Safe to proceed - Update Session Data & Push Reg
                    // We do this HERE to ensure we never register a device that isn't bound
                    try {
                        const { registerForPushNotifications } = require('../services/notifications');
                        const { updateUserSessionData } = require('../services/auth');

                        await registerForPushNotifications();
                        await updateUserSessionData(u.uid);
                    } catch (err) {
                        console.log('[Navigator] Non-critical session update failed:', err);
                    }

                    setUser(u);
                } catch (e) {
                    console.error('[Navigator] Error during auth checks:', e);
                    setUser(null);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    // Listen for account suspension
    useEffect(() => {
        let unsubscribeStatus = null;

        if (user) {
            unsubscribeStatus = subscribeToUserStatus(user.uid, async (isActive) => {
                if (isActive === false) {
                    Alert.alert(
                        "Account Suspended",
                        "Your account has been deactivated by the administrator.",
                        [{ text: "OK", onPress: () => logoutUser() }]
                    );
                    // Force logout immediately in case they don't press OK
                    await logoutUser();
                }
            });
        }

        return () => {
            if (unsubscribeStatus) unsubscribeStatus();
        };
    }, [user]);

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#b91c1c" />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {user ? (
                    <>
                        <Stack.Screen name="Home" component={HomeScreen} />
                        <Stack.Screen name="PhoneVerify" component={PhoneVerifyScreen} />
                        <Stack.Screen name="IssueReporting" component={IssueReportingScreen} />
                    </>
                ) : (
                    <>
                        <Stack.Screen name="Login" component={LoginScreen} />
                        <Stack.Screen name="Signup" component={SignupScreen} />
                        {/* PhoneVerify is typically part of Login flow or separate, here we keep it flexible */}
                        <Stack.Screen name="PhoneVerify" component={PhoneVerifyScreen} />
                        <Stack.Screen name="IssueReporting" component={IssueReportingScreen} />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
