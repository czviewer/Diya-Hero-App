import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ProgressBarAndroid, Platform, Alert, ActivityIndicator } from 'react-native';
import { subscribeToUpdates, downloadUpdate, installUpdate } from '../services/UpdateService';
import { Card } from './ui'; // Assuming you have a Card component

// Custom Progress Bar (because ProgressBarAndroid crashes in New Arch)
const ProgressBar = ({ progress }) => (
    <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
    </View>
);

const UpdateModal = () => {
    // ... (rest of component)
    const [visible, setVisible] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [status, setStatus] = useState('idle'); // idle, downloading, ready, error
    const [progress, setProgress] = useState(0);
    const [localFileUri, setLocalFileUri] = useState(null);

    useEffect(() => {
        const unsubscribe = subscribeToUpdates((config) => {
            console.log("Update received via subscription", config);
            if (config) {
                setUpdateInfo(config);
                setVisible(true);
            } else {
                setUpdateInfo(null);
                setVisible(false);
            }
        });
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const handleUpdate = async () => {
        if (!updateInfo?.downloadUrl) return;

        setStatus('downloading');
        try {
            const uri = await downloadUpdate(updateInfo.downloadUrl, (p) => {
                setProgress(p);
            });
            setLocalFileUri(uri);
            setStatus('ready');
        } catch (e) {
            setStatus('error');
            Alert.alert("Update Failed", "Could not download the update. Please try again later.");
            setVisible(false); // Or keep visible with retry?
        }
    };

    const handleInstall = async () => {
        // Alert.alert("Install", "Starting installation...");
        if (localFileUri) {
            try {
                await installUpdate(localFileUri);
            } catch (e) {
                Alert.alert("Error", "Installation failed to start.");
            }
        }
    };

    if (!visible || !updateInfo) return null;

    if (!visible || !updateInfo) return null;

    return (
        <Modal
            transparent
            animationType="slide"
            visible={visible}
            onRequestClose={() => {
                if (!updateInfo?.forceUpdate) setVisible(false);
            }}
        >
            <View style={styles.overlay}>
                <Card style={styles.modalCard}>
                    <Text style={styles.title}>Update Available</Text>
                    <Text style={styles.version}>Version {updateInfo.latestVersion}</Text>

                    <Text style={styles.description}>
                        {updateInfo.description || "A new version of the app is available. Please update to continue using the latest features."}
                    </Text>

                    {status === 'idle' && (
                        <TouchableOpacity style={styles.button} onPress={handleUpdate}>
                            <Text style={styles.buttonText}>Update Now</Text>
                        </TouchableOpacity>
                    )}

                    {status === 'downloading' && (
                        <View style={styles.progressContainer}>
                            <Text style={styles.progressText}>Downloading... {(progress * 100).toFixed(0)}%</Text>
                            <ProgressBar progress={progress} />
                        </View>
                    )}

                    {status === 'ready' && (
                        <TouchableOpacity style={[styles.button, styles.installButton]} onPress={handleInstall}>
                            <Text style={styles.buttonText}>Install Update</Text>
                        </TouchableOpacity>
                    )}

                    {status === 'error' && (
                        <TouchableOpacity
                            style={[styles.button, styles.errorButton]}
                            onPress={() => {
                                if (updateInfo?.forceUpdate) {
                                    setStatus('idle');
                                } else {
                                    setVisible(false);
                                }
                            }}
                        >
                            <Text style={styles.buttonText}>
                                {updateInfo?.forceUpdate ? 'Retry' : 'Close'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </Card>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalCard: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 24,
        elevation: 5
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 8,
        textAlign: 'center'
    },
    version: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 16,
        textAlign: 'center',
        fontWeight: '500'
    },
    description: {
        fontSize: 15,
        color: '#374151',
        marginBottom: 24,
        textAlign: 'center',
        lineHeight: 22
    },
    button: {
        backgroundColor: '#2563eb',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center'
    },
    installButton: {
        backgroundColor: '#10b981'
    },
    errorButton: {
        backgroundColor: '#ef4444'
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold'
    },
    progressContainer: {
        width: '100%',
        marginVertical: 10
    },
    progressText: {
        textAlign: 'center',
        marginBottom: 8,
        color: '#6b7280',
        fontSize: 13
    },
    progressBarBackground: {
        height: 10,
        backgroundColor: '#e5e7eb',
        borderRadius: 5,
        overflow: 'hidden',
        width: '100%'
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#2563eb',
        borderRadius: 5
    }
});

export default UpdateModal;
