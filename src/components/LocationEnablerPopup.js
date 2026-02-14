import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, BackHandler, Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { MapPin, Settings, LogOut } from 'lucide-react-native';
import { checkLocationServices } from '../services/location';

export default function LocationEnablerPopup() {
    const [isLocationDisabled, setIsLocationDisabled] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const checkLocation = async () => {
            if (!isMounted) return;

            try {
                const enabled = await checkLocationServices();
                if (isMounted) {
                    setIsLocationDisabled(!enabled);
                    setIsChecking(false);
                }
            } catch (error) {
                console.warn("Location check failed:", error);
                if (isMounted) {
                    setIsLocationDisabled(false); // Optimistic - allow app to proceed
                    setIsChecking(false);
                }
            }
        };

        // Initial check
        checkLocation();

        // Re-check every 3 seconds while modal is visible
        const interval = setInterval(checkLocation, 3000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    const handleOpenSettings = () => {
        if (Platform.OS === 'android') {
            IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS);
        } else {
            Linking.openSettings();
        }
    };

    const handleExit = () => {
        BackHandler.exitApp();
    };

    // Don't show modal while checking or if location is enabled
    if (isChecking || !isLocationDisabled) {
        return null;
    }

    return (
        <Modal
            visible={isLocationDisabled}
            transparent
            animationType="fade"
            onRequestClose={handleExit}
        >
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <MapPin size={32} color="#ef4444" />
                        <Text style={styles.title}>Location Required</Text>
                    </View>

                    <Text style={styles.message}>
                        Please enable Location Services (GPS) to use this app.
                    </Text>

                    <View style={styles.actionContainer}>
                        <TouchableOpacity
                            style={[styles.button, styles.exitButton]}
                            onPress={handleExit}
                        >
                            <LogOut size={20} color="#6b7280" style={{ marginRight: 8 }} />
                            <Text style={styles.exitButtonText}>Exit App</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.settingsButton]}
                            onPress={handleOpenSettings}
                        >
                            <Settings size={20} color="#ffffff" style={{ marginRight: 8 }} />
                            <Text style={styles.settingsButtonText}>Turn On</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 24,
        padding: 32,
        width: '100%',
        maxWidth: 400,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 10,
    },
    header: {
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#1f2937',
        marginTop: 12,
    },
    message: {
        fontSize: 15,
        color: '#6b7280',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    actionContainer: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
        marginBottom: 16,
    },
    button: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    exitButton: {
        backgroundColor: '#f3f4f6',
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    exitButtonText: {
        color: '#6b7280',
        fontSize: 15,
        fontWeight: '600',
    },
    settingsButton: {
        backgroundColor: '#6366f1',
    },
    settingsButtonText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '600',
    },
});
