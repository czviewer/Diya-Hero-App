import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, Switch, TouchableOpacity, Image, ActivityIndicator, Modal, Linking, Animated } from 'react-native';
import SecureStorage from '../../utils/SecureStorage';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card } from '../../components/ui';

import { auth, db } from '../../services/firebaseConfig';
import { signOut } from 'firebase/auth';
import { ref, get, onValue, push } from 'firebase/database';
import { getCurrentLocation, calculateDistance } from '../../services/location';
import { mobile_reportLocation } from '../../services/cloudFunctions';
import { performSecurityChecks, resetLocationTracking } from '../../services/securityChecks';
import { logActivityAsync, ActivityType } from '../../services/activityLog';
import { logoutUser } from '../../services/auth'; // Added
import { fetchTodayAttendance, submitAttendance, getAttendanceState, normalizeAfternoon, subscribeToTodayAttendance } from '../../services/attendance';
import { getServerISOString, getServerTime } from '../../services/timeManager';
import * as Location from 'expo-location';

import { DateTime } from 'luxon';
import { User, LogOut, Clock, CheckCircle, AlertTriangle, Coffee, XCircle, MessageCircle, MapPin, Info } from 'lucide-react-native';

const DailyStatusCard = ({ attendanceData, loading }) => {
    // 1. Determine Status
    let status = {
        label: "NOT CHECKED IN",
        subLabel: "Check-in to start.",
        color: "#6b7280", // Gray
        bgColor: "#f3f4f6",
        icon: <Clock size={24} color="#6b7280" />,
        badge: null
    };

    if (loading) {
        status = {
            label: "LOADING...",
            subLabel: "Fetching status...",
            color: "#6b7280",
            bgColor: "#f3f4f6",
            icon: <ActivityIndicator size="small" color="#6b7280" />,
            badge: null
        };
    } else if (attendanceData) {
        // Normalize
        const morning = attendanceData.morning === true;
        const afternoon = normalizeAfternoon(attendanceData.afternoon); // Enters, Leaves, None
        const exit = attendanceData.anExit === true;

        // --- CLASSIFICATION LOGIC ---
        let dayBadge = null;

        if (morning && exit) {
            dayBadge = { text: "FULL DAY", color: "#10b981", bg: "#d1fae5" }; // Green
        } else if ((morning && afternoon === 'Leaves') || (!morning && afternoon === 'Enters' && exit)) {
            dayBadge = { text: "HALF DAY", color: "#f59e0b", bg: "#fef3c7" }; // Amber
        } else if (!morning && !exit && afternoon === 'None') {
            // No punches yet - handled by default "Not Checked In"
            // But if we wanted to show "Absent" based on time, we could check time here.
            // For now, keep as null to avoid cluttering "Not Checked In"
        }

        // --- STATUS LOGIC ---
        if (exit) {
            status = {
                label: "COMPLETED",
                subLabel: "You have checked out for the day.",
                color: "#10b981", // Green
                bgColor: "#ecfdf5",
                icon: <CheckCircle size={24} color="#10b981" />,
                badge: dayBadge
            };
        } else if (afternoon === 'Leaves') {
            status = {
                label: "CHECKED OUT EARLY",
                subLabel: "You have left for the day.",
                color: "#f97316", // Orange
                bgColor: "#fff7ed",
                icon: <LogOut size={24} color="#f97316" />,
                badge: dayBadge
            };
        } else if (morning || afternoon === 'Enters') {
            status = {
                label: "ON DUTY",
                subLabel: "checkout pending",
                color: "#3b82f6", // Blue
                bgColor: "#eff6ff",
                icon: <Coffee size={24} color="#3b82f6" />,
                badge: null // Still pending, so no final credit badge yet
            };
        }
    }

    return (
        <View style={[styles.statusBanner, { backgroundColor: status.bgColor, borderColor: status.color }]}>
            <View style={[styles.iconBox, { backgroundColor: status.color + '20' }]}>
                {status.icon}
            </View>
            <View style={styles.statusTextContainer}>
                <View style={styles.statusTitleRow}>
                    <Text style={[styles.statusTitle, { color: status.color }]}>{status.label}</Text>
                    {status.badge && (
                        <View style={[styles.dayBadge, { backgroundColor: status.badge.bg }]}>
                            <Text style={[styles.dayBadgeText, { color: status.badge.color }]}>{status.badge.text}</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.statusSubtitle}>{status.subLabel}</Text>
            </View>
        </View>
    );
};

export default function HomeScreen({ navigation }) {
    const [user, setUser] = useState(auth.currentUser);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Status State
    const [locationStatus, setLocationStatus] = useState({ verified: false, message: "Checking..." });
    const [securityStatus, setSecurityStatus] = useState({ isSafe: true, threats: [] });
    const [attendanceData, setAttendanceData] = useState(null);
    const [currentTime, setCurrentTime] = useState(DateTime.now());

    // Track the most recent GPS coordinates (used to attach location to attendance logs)
    const [currentLocation, setCurrentLocation] = useState(null);

    // Form State
    const [morningCheck, setMorningCheck] = useState(false);
    const [afternoonStatus, setAfternoonStatus] = useState('None'); // None, Enters, Leaves
    const [exitCheck, setExitCheck] = useState(false);

    // Continuous Location State
    const [branchInfo, setBranchInfo] = useState(null);
    const [allBranches, setAllBranches] = useState(null); // Added for dynamic traveling tracking

    // Track last known location-verified state from the continuous watcher.
    // null = baseline not yet set by watcher (avoids double-logging on first tick).
    const prevVerifiedRef = useRef(null);

    // Share Location Button (admin-controlled visibility)
    const [showShareLocationBtn, setShowShareLocationBtn] = useState(false);
    const [sendingLocation, setSendingLocation] = useState(false);

    // UI Capabilities
    const [uiState, setUiState] = useState({
        morningEnabled: false,
        afternoonEnabled: false,
        exitEnabled: false,
        message: null
    });


    // Tip Frequency & Animation
    const [showTip, setShowTip] = useState(false);
    const marqueeAnim = useRef(new Animated.Value(0)).current;
    const [containerWidth, setContainerWidth] = useState(0);
    const [textWidth, setTextWidth] = useState(0);

    // Branding State
    const [nerodaUrl, setNerodaUrl] = useState(null);

    useEffect(() => {
        const urlRef = ref(db, 'config/branding/neroda_url');
        const unsubscribe = onValue(urlRef, (snapshot) => {
            const val = snapshot.exists() ? snapshot.val() : null;
            if (val && typeof val === 'string' && val.trim().length > 0) {
                setNerodaUrl(val.trim());
            } else {
                setNerodaUrl(null);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const checkTipFrequency = async () => {
            try {
                const countStr = await SecureStorage.getItem('tip_refresh_count');
                const count = countStr ? parseInt(countStr, 10) : 0;
                if (count < 5) {
                    setShowTip(true);
                    await SecureStorage.setItem('tip_refresh_count', (count + 1).toString());
                }
            } catch (e) {
                console.warn('Error checking tip frequency:', e);
            }
        };
        checkTipFrequency();
    }, []);

    useEffect(() => {
        if (showTip && containerWidth > 0 && textWidth > 0) {
            const startMarquee = () => {
                marqueeAnim.setValue(containerWidth);
                Animated.timing(marqueeAnim, {
                    toValue: -textWidth,
                    duration: 8000 + textWidth * 10, // Adjust speed based on text length
                    useNativeDriver: true,
                    isInteraction: false,
                }).start(() => startMarquee());
            };
            startMarquee();
        }
    }, [showTip, containerWidth, textWidth]);

    useEffect(() => {
        const updateTime = () => {
            const serverNow = getServerTime();
            setCurrentTime(DateTime.fromJSDate(serverNow, { zone: 'Asia/Kolkata' }));
        };
        updateTime(); // Initial update
        const timer = setInterval(updateTime, 1000);
        return () => clearInterval(timer);
    }, []);



    // REAL-TIME ATTENDANCE SUBSCRIPTION
    useEffect(() => {
        let unsubscribe = () => { };

        if (userData) {
            // Subscribe to real-time updates
            unsubscribe = subscribeToTodayAttendance(userData, (data) => {
                setAttendanceData(data);
                // Also trigger UI update immediately
                updateUiRules(data, locationStatus.verified);
            });
        } else {
            setAttendanceData(null);
        }

        return () => unsubscribe();
    }, [userData]); // Re-subscribe if user changes (e.g. login/out)

    // Sync UI Rules when Data/Location/Time changes
    useEffect(() => {
        if (userData && attendanceData !== null) {
            updateUiRules(attendanceData, locationStatus.verified);
        }
    }, [userData, attendanceData, locationStatus.verified, currentTime]);

    // Sync Local State from Real-time Data
    useEffect(() => {
        if (attendanceData) {
            setMorningCheck(attendanceData.morning === true);
            setAfternoonStatus(normalizeAfternoon(attendanceData.afternoon));
            setExitCheck(attendanceData.anExit === true);
        } else {
            setMorningCheck(false);
            setAfternoonStatus('None');
            setExitCheck(false);
        }
    }, [attendanceData]);

    // Listen to config/showShareLocation for button visibility
    useEffect(() => {
        const configRef = ref(db, 'config/showShareLocation');
        const unsubscribe = onValue(configRef, (snapshot) => {
            const val = snapshot.exists() ? snapshot.val() : false;
            // Accept boolean true or string "true"
            setShowShareLocationBtn(val === true || val === 'true');
        }, (error) => {
            console.warn('[Config] Error listening to showShareLocation:', error);
            setShowShareLocationBtn(false);
        });
        return () => unsubscribe();
    }, []);

    // ------------------------------------------------------------------
    // CONTINUOUS LOCATION MONITOR (Foreground Only)
    // ------------------------------------------------------------------
    useEffect(() => {
        let subscription = null;

        const startWatching = async () => {
            if (!branchInfo || !userData) return;

            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status !== 'granted') return;

                subscription = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.Balanced,
                        timeInterval: 3000, // Check every 3 seconds
                        distanceInterval: 0, // Force update even if stationary
                    },
                    (newLocation) => {
                        // Start with current branchInfo
                        let currentBranchData = branchInfo;
                        const bLat = currentBranchData.latitude ?? currentBranchData.lat;
                        const bLng = currentBranchData.longitude ?? currentBranchData.lng;

                        let dist = calculateDistance(
                            newLocation.coords.latitude,
                            newLocation.coords.longitude,
                            bLat,
                            bLng
                        );
                        let radius = Number(currentBranchData.radius) || 100;
                        let currentBranchId = currentBranchData.id || userData.branch;

                        // Dynamic Detection for Traveling Employees if outside current branch
                        if (userData.isTravelingEmployee && allBranches) {
                            let minDistance = Infinity;
                            let newClosestBranch = null;

                            Object.values(allBranches).forEach(bData => {
                                const targetLat = bData.latitude ?? bData.lat;
                                const targetLng = bData.longitude ?? bData.lng;

                                if (targetLat === undefined || targetLng === undefined) return;

                                const bDist = calculateDistance(
                                    newLocation.coords.latitude,
                                    newLocation.coords.longitude,
                                    targetLat,
                                    targetLng
                                );

                                // Find the absolute closest branch
                                if (bDist < minDistance) {
                                    minDistance = bDist;
                                    newClosestBranch = bData;
                                }
                            });

                            if (newClosestBranch && newClosestBranch.id !== currentBranchId) {
                                // We moved! Update state to the new closest branch
                                setBranchInfo(newClosestBranch);
                                currentBranchData = newClosestBranch;
                                dist = minDistance;
                                radius = Number(newClosestBranch.radius) || 100;
                                currentBranchId = newClosestBranch.id;
                            }
                        }

                        // Store latest GPS coords for attendance log attachment
                        setCurrentLocation({
                            latitude: newLocation.coords.latitude,
                            longitude: newLocation.coords.longitude,
                            accuracy: newLocation.coords.accuracy,
                            distance: Math.round(dist),
                            radius: radius
                        });

                        const isVerified = dist <= radius;

                        // ── Transition logging ───────────────────────────────
                        // Fire LOCATION_SUCCESS_IN only when moving inside after
                        // the watcher has confirmed an outside state (not on the
                        // very first tick, where verifyLocationAndFetchAttendance
                        // already wrote the initial log).
                        if (prevVerifiedRef.current === false && isVerified) {
                            logActivityAsync(ActivityType.LOCATION_SUCCESS_IN, {
                                accuracy: newLocation.coords.accuracy,
                                latitude: newLocation.coords.latitude,
                                longitude: newLocation.coords.longitude,
                                distance: Math.round(dist),
                                radius: radius,
                            });
                        }
                        prevVerifiedRef.current = isVerified;
                        // ─────────────────────────────────────────────────────

                        if (isVerified) {
                            let msg = `Verified (${dist.toFixed(0)}m)`;
                            if (userData.isTravelingEmployee && currentBranchId !== userData.branch) {
                                const branchName = currentBranchData.name || currentBranchId;
                                msg = `Visiting ${branchName} (${dist.toFixed(0)}m)`;
                            }
                            setLocationStatus({ verified: true, message: msg });
                        } else {
                            let msg = `Outside Range (${dist.toFixed(0)}m)`;
                            if (userData.isTravelingEmployee && currentBranchId !== userData.branch) {
                                const branchName = currentBranchData.name || currentBranchId;
                                msg = `Outside ${branchName} (${dist.toFixed(0)}m)`;
                            }
                            setLocationStatus({ verified: false, message: msg });
                        }

                        // Update UI Buttons (Dynamic Rule Check)
                        updateUiRules(attendanceData || {}, isVerified);
                    }
                );
            } catch (err) {
                console.log('[WATCHER] Error:', err);
                setLocationStatus({ verified: false, message: "Location tracking failed." });
                setUiState(prev => ({ ...prev, morningEnabled: false, afternoonEnabled: false, exitEnabled: false }));
            }
        };

        startWatching();

        return () => {
            if (subscription) {
                subscription.remove();
            }
            // Reset watcher baseline so the next mount starts fresh.
            prevVerifiedRef.current = null;
        };
    }, [branchInfo, userData, attendanceData]); // Re-run if branch or attendance data changes

    // Initial Load
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Start location fetch immediately (Hoisting)
            const locationPromise = getCurrentLocation();
            await fetchUserProfile(locationPromise);
            // Location and Attendance will be fetched after profile
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchUserProfile = async (locationPromise = null) => {
        if (!user) return;
        const snapshot = await get(ref(db, `users/${user.uid}`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            setUserData(data);

            // Check verification
            if (!data.isVerified) {
                navigation.replace('PhoneVerify');
                return;
            }

            await verifyLocationAndFetchAttendance(data, locationPromise);
        }
    };

    const verifyLocationAndFetchAttendance = async (profile, locationPromise = null) => {
        if (!profile || !profile.branch) {
            setLocationStatus({ verified: false, message: "No branch assigned." });
            return;
        }

        setLocationStatus({ verified: false, message: "Locating..." });

        try {
            // 1. Parallel Fetch: Location (use passed promise or new one) & Branch Data
            const locProm = locationPromise || getCurrentLocation();

            const [location, branchSnap] = await Promise.all([
                locProm,
                get(ref(db, `branches/${profile.branch}`))
            ]);

            // 2. Validate Location
            if (!location) {
                setLocationStatus({ verified: false, message: "Location permission denied or unavailable." });
                return;
            }

            // Store latest GPS coords for attendance log attachment (Calculate distance if branch exists)
            let initialDistance = undefined;
            let initialRadius = 200;

            if (branchSnap.exists()) {
                const bData = branchSnap.val();
                initialRadius = Number(bData.radius) || 100;
                initialDistance = calculateDistance(
                    location.coords.latitude,
                    location.coords.longitude,
                    bData.latitude,
                    bData.longitude
                );
            }

            setCurrentLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy,
                distance: initialDistance !== undefined ? Math.round(initialDistance) : undefined,
                radius: initialRadius
            });

            // 2.5. SECURITY CHECKS - Check for manipulation attempts
            setLocationStatus({ verified: false, message: "Running security checks..." });
            const securityResult = await performSecurityChecks(location);
            setSecurityStatus(securityResult);

            if (!securityResult.isSafe) {
                // Security threat detected - block verification
                const primaryThreat = securityResult.threats[0];
                setLocationStatus({
                    verified: false,
                    message: `Security: ${primaryThreat.type.replace('_', ' ')}`
                });
                // Disable all attendance actions
                setUiState({
                    morningEnabled: false,
                    afternoonEnabled: false,
                    exitEnabled: false,
                    message: primaryThreat.message
                });

                // Show blocking alert with Exit App button
                Alert.alert(
                    "Security Issue Detected",
                    primaryThreat.message + "\n\nThe app will now close.",
                    [
                        {
                            text: "Exit App",
                            onPress: () => {
                                const { BackHandler } = require('react-native');
                                BackHandler.exitApp();
                            }
                        }
                    ],
                    { cancelable: false } // Prevent dismissing without action
                );
                return;
            }

            // 3. Validate Branch & Dynamic Detection for Traveling Employees
            let finalBranchData = null;
            let finalDistance = undefined;
            let finalBranchId = profile.branch;

            if (profile.isTravelingEmployee) {
                try {
                    // Fetch all branches to find the closest one
                    const allBranchesSnap = await get(ref(db, `branches`));
                    if (allBranchesSnap.exists()) {
                        const allBranchesData = allBranchesSnap.val();

                        // Map IDs into the branch objects
                        const processedBranches = {};
                        Object.keys(allBranchesData).forEach(key => {
                            processedBranches[key] = { ...allBranchesData[key], id: key };
                        });

                        setAllBranches(processedBranches); // Save for the watcher!

                        let closestBranch = null;
                        let minDistance = Infinity;

                        // Iterate through all branches to find the closest one
                        Object.keys(processedBranches).forEach(bId => {
                            const bData = processedBranches[bId];
                            const targetLat = bData.latitude ?? bData.lat;
                            const targetLng = bData.longitude ?? bData.lng;

                            if (targetLat === undefined || targetLng === undefined) return;

                            const dist = calculateDistance(
                                location.coords.latitude,
                                location.coords.longitude,
                                targetLat,
                                targetLng
                            );

                            // Find the absolute closest branch
                            if (dist < minDistance) {
                                minDistance = dist;
                                closestBranch = bData;
                                finalBranchId = bId;
                            }
                        });

                        if (closestBranch) {
                            finalBranchData = closestBranch;
                            finalDistance = minDistance;
                        }
                    }
                } catch (err) {
                    console.warn("[TRAVEL] Failed to fetch all branches (Permission likely):", err.message);
                    // Continue to fallback below
                }

                // Fallback to home branch if closest not found or fetch failed
                if (!finalBranchData && branchSnap.exists()) {
                    finalBranchData = branchSnap.val();
                    const hLat = finalBranchData.latitude ?? finalBranchData.lat;
                    const hLng = finalBranchData.longitude ?? finalBranchData.lng;
                    finalDistance = calculateDistance(location.coords.latitude, location.coords.longitude, hLat, hLng);
                }
            } else {
                // Normal Employee behavior
                if (branchSnap.exists()) {
                    finalBranchData = branchSnap.val();
                    const hLat = finalBranchData.latitude ?? finalBranchData.lat;
                    const hLng = finalBranchData.longitude ?? finalBranchData.lng;
                    finalDistance = calculateDistance(location.coords.latitude, location.coords.longitude, hLat, hLng);
                }
            }

            if (!finalBranchData) {
                setLocationStatus({ verified: false, message: "Branch data invalid." });
                return;
            }

            setBranchInfo({ ...finalBranchData, id: finalBranchId }); // Save for continuous monitoring and UI

            const radius = Number(finalBranchData.radius) || 100;

            if (finalDistance <= radius) {
                let msg = `Verified (${finalDistance.toFixed(0)}m)`;
                if (profile.isTravelingEmployee && finalBranchId !== profile.branch) {
                    const branchName = finalBranchData.name || finalBranchId;
                    msg = `Visiting ${branchName} (${finalDistance.toFixed(0)}m)`;
                }
                setLocationStatus({ verified: true, message: msg });

                // Log verified location (IN)
                logActivityAsync(ActivityType.LOCATION_SUCCESS_IN, {
                    accuracy: location.coords.accuracy,
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    distance: finalDistance,
                    radius: radius,
                    branch: finalBranchId // Track which branch they are at
                });
            } else {
                setLocationStatus({ verified: false, message: `Outside Range (${finalDistance.toFixed(0)}m)` });

                // Log unverified location (OUT)
                logActivityAsync(ActivityType.LOCATION_SUCCESS_OUT, {
                    accuracy: location.coords.accuracy,
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    distance: finalDistance,
                    radius: radius,
                    branch: finalBranchId
                });
            }

            // 4. Update UI State rules
            updateUiRules(attendanceData || {}, (finalDistance <= radius));

        } catch (error) {
            console.error("Error in verification:", error);
            let msg = "Verification failed.";
            if (error.message.includes("Location services are disabled")) {
                msg = "Location services disabled.";
            } else if (error.message.includes("Location permission denied")) {
                msg = "Permission denied.";
            }
            setLocationStatus({ verified: false, message: msg });
        }
    };

    const updateUiRules = (attData, isLocVerified) => {
        const serverNow = getServerTime();
        const now = DateTime.fromJSDate(serverNow, { zone: 'Asia/Kolkata' });
        const { hour, minute } = now;

        const rules = getAttendanceState(attData, hour, minute);

        // If location bad, disable all
        if (!isLocVerified) {
            setUiState({ ...rules, morningEnabled: false, afternoonEnabled: false, exitEnabled: false, message: "Location not verified" });
        } else {
            setUiState(rules);
        }
    };

    const handleRefresh = async (silent = false) => {
        if (!silent) setRefreshing(true);
        // Start location fetch immediately (Hoisting)
        const locationPromise = getCurrentLocation();
        await fetchUserProfile(locationPromise); // Re-runs everything
        if (!silent) setRefreshing(false);
    };

    const handleHelp = () => {
        navigation.navigate('IssueReporting');
    };

    const handleShareLocation = async () => {
        if (sendingLocation) return;
        setSendingLocation(true);
        try {
            const location = await getCurrentLocation();
            if (!location) {
                Alert.alert('Location Unavailable', 'Could not get your current location. Please ensure location permission is granted and GPS is enabled.');
                return;
            }

            const userId = auth.currentUser?.uid;
            if (!userId) {
                Alert.alert('Error', 'You must be logged in.');
                return;
            }

            await mobile_reportLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy,
                altitude: location.coords.altitude,
                distance: currentLocation?.distance,
                radius: currentLocation?.radius
            });

            Alert.alert('Location Shared ✓', `Your location has been sent to the admin.\n\nLat: ${location.coords.latitude.toFixed(6)}\nLng: ${location.coords.longitude.toFixed(6)}\nAccuracy: ${location.coords.accuracy.toFixed(0)}m`);
        } catch (error) {
            console.error('[ShareLocation] Error:', error);
            Alert.alert('Error', 'Failed to share location. Please try again.');
        } finally {
            setSendingLocation(false);
        }
    };

    const confirmAndPunch = (type, newValue) => {
        if (!userData) return;

        // Don't allow unchecking - only allow new entries
        if (!newValue) {
            Alert.alert("Not Allowed", "You cannot uncheck an attendance entry once it's submitted.");

            return;
        }

        // Prepare confirmation messages
        let title = "";
        let message = "";

        if (type === 'morning') {
            title = "Check In - Morning";
            message = "Are you sure you want to check in for the morning session?";
        } else if (type === 'afternoon') {
            if (newValue === 'Enters') {
                title = "Afternoon Check In";
                message = "Are you sure you want to check in for the afternoon session?";
            } else if (newValue === 'Leaves') {
                title = "Afternoon Check out";
                message = "Are you sure you want to check out for Early?";
            } else {
                title = `Afternoon - ${newValue}`;
                message = `Are you sure you want to set afternoon status as "${newValue}"?`;
            }
        } else if (type === 'exit') {
            title = "Check Out";
            message = "Are you sure you want to check out for the day?";
        }

        Alert.alert(
            title,
            message,
            [
                {
                    text: "Cancel",
                    style: "cancel",
                    onPress: () => {
                        // Cancelled - do nothing, state hasn't changed yet
                    }
                },
                {
                    text: "Confirm",
                    onPress: () => autoPunch(type, newValue)
                }
            ]
        );
    };

    const autoPunch = async (type, newValue) => {
        if (!userData) return;

        // Show loading state for the specific punch
        setLoading(true);
        const timestamp = getServerISOString();
        const payload = {};

        if (type === 'morning') {
            payload.morning = newValue;
            payload.morningTime = timestamp;
            payload.morningLocked = newValue;
        } else if (type === 'afternoon') {
            // Logic Check
            if (morningCheck && newValue === "Enters") {
                Alert.alert("Error", "Cannot Check-In if checked in Morning.");
                setLoading(false);
                return;
            }
            if (!morningCheck && newValue === "Leaves") {
                Alert.alert("Error", "Cannot Check-Out if not checked in Morning.");
                setLoading(false);
                return;
            }
            payload.afternoon = newValue;
            payload.anTime = timestamp;
            if (newValue !== 'None') payload.anLocked = true;
        } else if (type === 'exit') {
            payload.anExit = true;
            payload.anExitTime = timestamp;
            payload.anLocked = true;
            payload.morningLocked = true;
        }

        try {
            // Pass the most recent verified GPS location and the CURRENTly detected branch
            await submitAttendance(userData, payload, currentLocation, branchInfo?.id || userData.branch);
            Alert.alert("Success", "Punched successfully!");
            // No need to fetch manually, listener handles it
        } catch (error) {
            Alert.alert("Sync Error", "Could not save punch. Please check your connection.");
            console.error(error);
            // State not changed locally, so no need to revert
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        Alert.alert("Logout", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Logout",
                onPress: () => {
                    resetLocationTracking(); // Clear location jump tracking
                    logoutUser(currentLocation); // Pass location for distance logging
                }
            }
        ]);
    };

    // ═══════════════ VISIBILITY LOGIC ═══════════════
    const hour = currentTime.hour;

    // Morning: Visible if Checked In OR if currently within Morning Window ( < 12 PM )
    // If user missed the morning window ( >= 12 PM ) and didn't punch, hide it.
    const showMorning = morningCheck || hour < 12;

    // Afternoon: Visible 12:00 PM - 02:59 PM, OR if you have already punched a status.
    // Note: If punched, we always show it to allow viewing status.
    const isAfternoonTime = hour >= 12 && hour < 15;
    const hasAfternoonStatus = afternoonStatus !== 'None';
    const showAfternoon = isAfternoonTime || hasAfternoonStatus;

    // Evening: Visible 03:00 PM - 11:59 PM (Implicit until end of day)
    // BUT ONLY if you Checked In Morning OR Checked Enters Afternoon.
    const isEveningTime = hour >= 15;
    const isCheckedIn = morningCheck || afternoonStatus === 'Enters';
    // User requested: "Evening Checkout Appear Only if (Morning OR Afternoon checked In ) AND Time is between 3PM and 11:59 PM."
    // AND we must NOT show it if user already 'Leaves' in Afternoon.
    const showEvening = isEveningTime && isCheckedIn && afternoonStatus !== 'Leaves';

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.headerContainer}>
                {/* Top Row: Logo and Company Name */}
                <View style={styles.headerTop}>
                    <View style={styles.logoSection}>
                        <Image
                            source={require('../../../Hero-Logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <View style={styles.companyInfo}>
                            <Text style={styles.companyName}>Diya-Hero App</Text>
                            <Text style={styles.tagline}>Attendance System</Text>
                        </View>
                    </View>
                </View>

                {/* Bottom Row: User Info and Logout */}
                <View style={styles.headerBottom}>
                    <Text style={styles.welcomeText}>Welcome,</Text>
                    <Text style={styles.userName}>{userData?.name || 'Employee'}</Text>
                    {showShareLocationBtn && (
                        <TouchableOpacity
                            onPress={handleShareLocation}
                            style={styles.shareLocationBtn}
                            disabled={sendingLocation}
                            activeOpacity={0.7}
                        >
                            {sendingLocation ? (
                                <ActivityIndicator size="small" color="#6366f1" />
                            ) : (
                                <MapPin size={18} color="#6366f1" />
                            )}
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                        <Text style={styles.logoutText}>Logout</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            >
                {/* Daily Status Banner */}
                <DailyStatusCard attendanceData={attendanceData} loading={loading} />

                {/* Status Section */}
                <View style={styles.statusRow}>
                    <Card style={[styles.statusCard, { flex: 1.6, marginRight: 8 }]}>
                        <Text style={styles.statusLabel}>Location</Text>
                        <Text style={[styles.statusValue, locationStatus.verified ? styles.textSuccess : styles.textError]}>
                            {locationStatus.verified ? "Verified" : "Unverified"}
                        </Text>
                        <Text style={styles.statusSub} numberOfLines={2}>{locationStatus.message}</Text>
                    </Card>
                    <Card style={[styles.statusCard, { flex: 1, marginLeft: 8 }]}>
                        <Text style={styles.statusLabel}>Time</Text>
                        <Text style={styles.statusValue}>{currentTime.toFormat('hh:mm a')}</Text>
                        <Text style={styles.statusSub}>{currentTime.toFormat('EEE, dd MMM')}</Text>
                    </Card>
                </View>

                {/* Swipe Refresh Tip - Frequency Limited & Marquee */}
                {showTip && (
                    <View
                        style={styles.marqueeContainer}
                        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
                    >
                        <Animated.View
                            style={[
                                styles.marqueeWrapper,
                                { transform: [{ translateX: marqueeAnim }] }
                            ]}
                        >
                            <Text
                                style={styles.marqueeText}
                                onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
                            >
                                Tip: Swipe down to manually refresh your location and status.
                            </Text>
                        </Animated.View>
                    </View>
                )}



                {/* ═══════════════ MORNING CHECK-IN ═══════════════ */}
                {showMorning && (
                    <Card style={styles.punchCard}>
                        <View style={styles.punchHeader}>
                            <Text style={styles.punchIcon}>☀️</Text>
                            <Text style={styles.punchTitle}>MORNING CHECK-IN</Text>
                            <Text style={styles.punchTime}>08:00 AM - 11:59 AM</Text>
                        </View>

                        <View style={styles.punchContent}>
                            {morningCheck ? (
                                <View style={styles.statusDisplay}>
                                    <View style={styles.statusBadge}>
                                        <Text style={styles.statusBadgeIcon}>✓</Text>
                                        <Text style={styles.statusBadgeText}>CHECKED IN</Text>
                                    </View>
                                    {attendanceData?.morningTime && (
                                        <Text style={styles.statusTimestamp}>
                                            at {new Date(attendanceData.morningTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    )}
                                </View>
                            ) : (
                                <Text style={styles.statusNotMarked}>Not checked in yet</Text>
                            )}

                            {!morningCheck && (
                                <TouchableOpacity
                                    style={[
                                        styles.actionButton,
                                        !uiState.morningEnabled && styles.actionButtonDisabled
                                    ]}
                                    onPress={() => {
                                        if (!uiState.morningEnabled) {
                                            if (!locationStatus.verified) {
                                                Alert.alert("Location Unverified", locationStatus.message || "You are outside the branch radius.");
                                                return;
                                            }
                                            Alert.alert("Time Window Locked", "Morning check-in is only available between 08:00 AM and 11:59 AM.");
                                            return;
                                        }
                                        const newCheck = true;
                                        confirmAndPunch('morning', newCheck);
                                    }}
                                    disabled={loading}
                                    activeOpacity={!uiState.morningEnabled ? 1 : 0.7}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="white" size="small" />
                                    ) : (
                                        <Text style={styles.actionButtonText}>CHECK IN</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </Card>
                )}

                {/* ═══════════════ AFTERNOON STATUS ═══════════════ */}
                {showAfternoon && (
                    <Card style={styles.punchCard}>
                        <View style={styles.punchHeader}>
                            <Text style={styles.punchIcon}>🌤️</Text>
                            <Text style={styles.punchTitle}>AFTERNOON CHECK-IN/OUT</Text>
                            <Text style={styles.punchTime}>12:00 PM - 02:59 PM</Text>
                        </View>

                        <View style={styles.statusCardGroup}>
                            {[
                                { key: 'Enters', icon: '↓', label: 'ENTERS', desc: 'Check-in After Noon' },
                                { key: 'Leaves', icon: '↑', label: 'LEAVES', desc: 'Check-out Early' },
                                { key: 'None', icon: '—', label: 'NONE', desc: 'No change' }
                            ].map((option) => {
                                const isOptionDisabled =
                                    (option.key === 'Leaves' && !morningCheck) ||
                                    (option.key === 'Enters' && morningCheck);

                                return (
                                    <TouchableOpacity
                                        key={option.key}
                                        style={[
                                            styles.statusCard,
                                            afternoonStatus === option.key && styles.statusCardActive,
                                            (!uiState.afternoonEnabled || isOptionDisabled) && styles.statusCardDisabled
                                        ]}
                                        onPress={() => {
                                            if (!uiState.afternoonEnabled) {
                                                if (!locationStatus.verified) {
                                                    Alert.alert("Location Unverified", locationStatus.message || "You are outside the branch radius.");
                                                    return;
                                                }
                                                Alert.alert("Time Window Locked", "Afternoon check-in/out are only available between 12:00 PM and 02:59 PM.");
                                                return;
                                            }

                                            if (isOptionDisabled) {
                                                Alert.alert("Action Not Allowed",
                                                    option.key === 'Leaves'
                                                        ? "You cannot 'Check-Out' if you haven't checked in for the morning."
                                                        : "You cannot 'Check-In' if you are already checked in."
                                                );
                                                return;
                                            }
                                            confirmAndPunch('afternoon', option.key);
                                        }}
                                        disabled={loading}
                                        activeOpacity={(!uiState.afternoonEnabled || isOptionDisabled) ? 1 : 0.7}
                                    >
                                        <Text style={[
                                            styles.statusCardIcon,
                                            afternoonStatus === option.key && styles.statusCardIconActive,
                                            isOptionDisabled && { opacity: 0.3 }
                                        ]}>{option.icon}</Text>
                                        <Text style={[
                                            styles.statusCardLabel,
                                            afternoonStatus === option.key && styles.statusCardLabelActive,
                                            isOptionDisabled && { color: '#cbd5e1' }
                                        ]}>{option.label}</Text>
                                        <Text style={[
                                            styles.statusCardDesc,
                                            isOptionDisabled && { color: '#cbd5e1' }
                                        ]}>{option.desc}</Text>
                                        {afternoonStatus === option.key && (
                                            <>
                                                <View style={styles.statusCardCheck}>
                                                    {loading ? (
                                                        <ActivityIndicator color="white" size="small" />
                                                    ) : (
                                                        <Text style={styles.statusCardCheckText}>✓</Text>
                                                    )}
                                                </View>
                                                {attendanceData?.anTime && (
                                                    <Text style={[styles.statusTimestamp, { marginTop: 8, fontSize: 11 }]}>
                                                        at {new Date(attendanceData.anTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                    </Text>
                                                )}
                                            </>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </Card>
                )}

                {/* ═══════════════ END OF DAY ═══════════════ */}
                {showEvening && (
                    <Card style={styles.punchCard}>
                        <View style={styles.punchHeader}>
                            <Text style={styles.punchIcon}>🌙</Text>
                            <Text style={styles.punchTitle}>EVENING CHECK-OUT</Text>
                            <Text style={styles.punchTime}>03:00 PM - 11:30 PM</Text>
                        </View>

                        <View style={styles.punchContent}>
                            {exitCheck ? (
                                <View style={styles.statusDisplay}>
                                    <View style={styles.statusBadge}>
                                        <Text style={styles.statusBadgeIcon}>✓</Text>
                                        <Text style={styles.statusBadgeText}>CHECKED OUT</Text>
                                    </View>
                                    {attendanceData?.anExitTime && (
                                        <Text style={styles.statusTimestamp}>
                                            at {new Date(attendanceData.anExitTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    )}
                                </View>
                            ) : (
                                <Text style={styles.statusNotMarked}>Not checked out yet</Text>
                            )}

                            {!exitCheck && (
                                <TouchableOpacity
                                    style={[
                                        styles.actionButton,
                                        styles.actionButtonExit,
                                        !uiState.exitEnabled && styles.actionButtonDisabled
                                    ]}
                                    onPress={() => {
                                        if (!uiState.exitEnabled) {
                                            if (!locationStatus.verified) {
                                                Alert.alert("Location Unverified", locationStatus.message || "You are outside the branch radius.");
                                                return;
                                            }
                                            // More specific messages based on why it's disabled
                                            if (morningCheck && afternoonStatus === 'None') {
                                                // Valid flow but maybe outside time
                                                Alert.alert("Time Window Locked", "Evening checkout is only available between 03:00 PM and 11:30 PM.");
                                            } else if (!morningCheck && afternoonStatus === 'Enters') {
                                                // Valid flow but outside time
                                                Alert.alert("Time Window Locked", "Evening checkout is only available between 03:00 PM and 11:30 PM.");
                                            } else if (morningCheck && afternoonStatus === 'Leaves') {
                                                // Specific scenario: Morning IN + Afternoon OUT
                                                Alert.alert("Action Not Allowed", "You have already 'Checked Out' in the Afternoon. You cannot Check Out again.");
                                            } else {
                                                // Invalid flow
                                                Alert.alert("Action Not Allowed", "You must be checked in (Morning or Afternoon) to check out.");
                                            }
                                            return;
                                        }
                                        const newCheck = true;
                                        confirmAndPunch('exit', newCheck);
                                    }}
                                    disabled={loading}
                                    activeOpacity={!uiState.exitEnabled ? 1 : 0.7}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="white" size="small" />
                                    ) : (
                                        <Text style={styles.actionButtonText}>CHECK OUT</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </Card>
                )}


            </ScrollView>

            {/* ═══════════════ BRANDING FOOTER (FIXED) ═══════════════ */}
            <View style={styles.brandingFooter}>
                <Text style={styles.developedBy}>DEVELOPED BY</Text>
                <TouchableOpacity
                    onPress={() => nerodaUrl && Linking.openURL(nerodaUrl)}
                    activeOpacity={nerodaUrl ? 0.7 : 1}
                    style={styles.brandingTouch}
                >
                    <Text style={styles.nerodaName}>Neroda IT Solutions</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.fab}
                onPress={handleHelp}
                activeOpacity={0.8}
            >
                <MessageCircle size={28} color="white" />
            </TouchableOpacity>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 30,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#3b82f6', // Blue-500
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        zIndex: 999,
    },
    container: { flex: 1, backgroundColor: '#f3f4f6' },

    // Header Container
    headerContainer: {
        backgroundColor: '#ffffff',
        paddingBottom: 16,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
    },

    // Status Banner
    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    statusTextContainer: {
        flex: 1,
    },
    statusTitle: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    statusTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        gap: 8,
    },
    dayBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    dayBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    statusSubtitle: {
        fontSize: 13,
        color: '#64748b',
        fontWeight: '500',
    },

    // Top Row - Logo and Company
    headerTop: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    logoSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    logo: {
        width: 50,
        height: 50,
        borderRadius: 8,
    },
    companyInfo: {
        flex: 1,
    },
    companyName: {
        color: '#111827',
        fontSize: 22,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    tagline: {
        color: '#6b7280',
        fontSize: 11,
        fontWeight: '500',
        marginTop: 2,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },

    // Bottom Row - User Info
    headerBottom: {
        paddingHorizontal: 16,
        paddingTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    welcomeText: {
        color: '#6b7280',
        fontSize: 13,
        fontWeight: '500',
        marginRight: 4,
    },
    userName: {
        color: '#111827',
        fontSize: 15,
        fontWeight: '700',
        flex: 1,
    },
    shareLocationBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#eef2ff',
        borderWidth: 1,
        borderColor: '#c7d2fe',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    logoutBtn: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 8,
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    logoutText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    scrollContent: { padding: 16 },
    marqueeContainer: {
        height: 30,
        overflow: 'hidden',
        width: '100%',
        marginBottom: 10,
        justifyContent: 'center',
    },
    marqueeWrapper: {
        flexDirection: 'row',
        position: 'absolute',
    },
    marqueeText: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '500',
    },
    statusRow: { flexDirection: 'row', marginBottom: 10 },
    statusCard: { paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center' },
    statusLabel: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 'bold' },
    statusValue: { fontSize: 17, fontWeight: 'bold', color: '#1f2937', marginVertical: 4 },
    statusSub: { fontSize: 11, color: '#9ca3af', textAlign: 'center' },
    textSuccess: { color: '#10b981' },
    textError: { color: '#ef4444' },
    controlCard: { padding: 16 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1f2937', marginBottom: 12 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    label: { fontSize: 16, color: '#374151' },

    // ═══════════════ PUNCH CARD STYLES ═══════════════
    punchCard: {
        padding: 0,
        marginBottom: 16,
        overflow: 'hidden',
    },
    punchHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#f8fafc',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    punchIcon: {
        fontSize: 20,
        marginRight: 10,
    },
    punchTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
        color: '#1e293b',
        letterSpacing: 0.5,
    },
    punchTime: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '500',
    },

    // Punch Card Content
    punchContent: {
        padding: 16,
    },

    // Status Display (when checked in/out)
    statusDisplay: {
        marginBottom: 16,
        alignItems: 'center',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10b981',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    statusBadgeIcon: {
        fontSize: 16,
        color: 'white',
        fontWeight: 'bold',
    },
    statusBadgeText: {
        fontSize: 14,
        fontWeight: '700',
        color: 'white',
        letterSpacing: 0.5,
    },
    statusTimestamp: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 6,
    },
    statusNotMarked: {
        fontSize: 14,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: 16,
        fontStyle: 'italic',
    },

    // Action Button (replaces large punch box)
    actionButton: {
        backgroundColor: '#ef4444', // Red-500
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
        minHeight: 48,
    },
    actionButtonChecked: {
        backgroundColor: '#10b981',
        shadowColor: '#10b981',
    },
    actionButtonExit: {
        backgroundColor: '#f97316',
        shadowColor: '#f97316',
    },
    actionButtonExitChecked: {
        backgroundColor: '#ef4444',
        shadowColor: '#ef4444',
    },
    actionButtonDisabled: {
        backgroundColor: '#cbd5e1',
        shadowColor: '#cbd5e1',
        shadowOpacity: 0.1,
    },
    actionButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: 'white',
        letterSpacing: 0.8,
    },

    // ═══════════════ AFTERNOON STATUS CARD STYLES ═══════════════
    statusCardGroup: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 16,
        gap: 10,
    },
    statusCard: {
        flex: 1,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#e2e8f0',
        position: 'relative',
    },
    statusCardActive: {
        backgroundColor: '#eff6ff',
        borderColor: '#3b82f6',
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    statusCardDisabled: {
        backgroundColor: '#f1f5f9',
        opacity: 0.5,
    },
    statusCardIcon: {
        fontSize: 24,
        color: '#64748b',
        fontWeight: 'bold',
        marginBottom: 6,
    },
    statusCardIconActive: {
        color: '#3b82f6',
    },
    statusCardLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
        letterSpacing: 0.5,
    },
    statusCardLabelActive: {
        color: '#1e40af',
    },
    statusCardDesc: {
        fontSize: 10,
        color: '#94a3b8',
        marginTop: 4,
    },
    statusCardCheck: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#3b82f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusCardCheckText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },

    // Blocking Modal
    blockingOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    blockingCard: {
        backgroundColor: 'white',
        padding: 24,
        borderRadius: 20,
        alignItems: 'center',
        width: '85%',
        maxWidth: 340,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    blockingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 12
    },
    blockingTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    blockingText: {
        fontSize: 15,
        color: '#4b5563',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22
    },
    blockingActionContainer: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    blockingBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
    },
    blockingBtnExit: {
        backgroundColor: '#f3f4f6',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    blockingBtnSettings: {
        backgroundColor: '#ef4444',
    },
    blockingBtnTextExit: {
        color: '#374151',
        fontWeight: '600',
        fontSize: 14
    },
    blockingBtnTextSettings: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14
    },

    // ═══════════════ BRANDING FOOTER STYLES ═══════════════
    brandingFooter: {
        backgroundColor: 'transparent',
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    developedBy: {
        fontSize: 8,
        color: '#94a3b8',
        fontWeight: '700',
        letterSpacing: 1.5,
        marginBottom: 1,
    },
    brandingTouch: {
        paddingVertical: 0,
    },
    nerodaName: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#4f46e5', // indigo-600
        letterSpacing: 0.5,
    },
});
