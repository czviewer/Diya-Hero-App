import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View, Alert, Text, Animated } from 'react-native';
import SecureStorage from '../utils/SecureStorage';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { checkDeviceBinding, subscribeToUserStatus, logoutUser, lastManualLoginTimestamp } from '../services/auth';
import * as Location from 'expo-location';

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
    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
        }).start();
    }, [loading]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) {
                // 1. Block UI until Device Binding is Verified
                try {
                    // Silently fetch location for the device bind log
                    let bindLocation = null;
                    try {
                        const { status } = await Location.getForegroundPermissionsAsync();
                        if (status === 'granted') {
                            let loc = await Location.getLastKnownPositionAsync();
                            if (!loc) {
                                loc = await Location.getCurrentPositionAsync({
                                    accuracy: Location.Accuracy.Balanced,
                                    timeout: 1500,
                                });
                            }
                            if (loc) {
                                bindLocation = {
                                    latitude: loc.coords.latitude,
                                    longitude: loc.coords.longitude,
                                    accuracy: loc.coords.accuracy
                                };
                            }
                        }
                    } catch (locErr) {
                        // Silent - location is optional for bind log
                    }

                    const binding = await checkDeviceBinding(u.uid, false, bindLocation);
                    if (!binding.allowed && binding.errorCode !== 'technical_error') {
                        console.log('[Navigator] Security rejection: Device binding failed. Forcing logout.');
                        await logoutUser();
                        setUser(null);
                        setLoading(false);
                        return; // Stop here
                    }
                    
                    if (!binding.allowed && binding.errorCode === 'technical_error') {
                        console.log('[Navigator] Technical error during binding check. Allowing session to continue offline.');
                    }

                    // 2. Safe to proceed - Sync All Metadata (Push Token, Session Data, Device Info)
                    try {
                        const { syncAllMetadata } = require('../services/auth');
                        syncAllMetadata(u.uid).catch(err => console.log('[Navigator] Sync error:', err));
                    } catch (err) {
                        console.log('[Navigator] Non-critical metadata sync failed:', err);
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
            unsubscribeStatus = subscribeToUserStatus(user.uid, async (userData) => {
                const isActive = userData.isActive !== false;
                const forceLogoutAt = userData.forceLogoutAt || 0;

                // Fetch last known login time from local storage or in-memory cache
                const lastLoginAtStr = await SecureStorage.getItem('lastLoginAt');
                const storedLastLogin = lastLoginAtStr ? parseInt(lastLoginAtStr, 10) : 0;
                const lastLoginAt = Math.max(storedLastLogin, lastManualLoginTimestamp);

                // 1. Suspension Check
                if (!isActive) {
                    Alert.alert(
                        "Account Suspended",
                        "Your account has been deactivated by the administrator.",
                        [{ text: "OK", onPress: () => logoutUser() }]
                    );
                    await logoutUser();
                    return;
                }

                // 2. Force Logout Check (Session Revocation)
                if (forceLogoutAt > lastLoginAt) {
                    Alert.alert(
                        "Session Expired",
                        "Your session has been revoked by the administrator. Please log in again.",
                        [{ text: "OK", onPress: () => logoutUser() }]
                    );
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
            <Animated.View style={{ flex: 1, opacity: fadeAnim, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
                <ActivityIndicator size="large" color="#ef4444" />
                <View style={{ marginTop: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
                        Please Wait
                    </Text>
                    <Text style={{ fontSize: 16, color: '#1e293b', fontWeight: '500' }}>
                        Don't close the app..
                    </Text>
                </View>
            </Animated.View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
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
                            <Stack.Screen name="PhoneVerify" component={PhoneVerifyScreen} />
                            <Stack.Screen name="IssueReporting" component={IssueReportingScreen} />
                        </>
                    )}
                </Stack.Navigator>
            </NavigationContainer>
        </View>
    );
}
