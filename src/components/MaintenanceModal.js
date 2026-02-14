import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { ref, onValue } from 'firebase/database';
import { db } from '../services/firebaseConfig';
import { ShieldAlert } from 'lucide-react-native';

const MaintenanceModal = () => {
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const maintenanceRef = ref(db, 'config/system/maintenanceMode');
        const unsubscribe = onValue(maintenanceRef, (snapshot) => {
            setMaintenanceMode(snapshot.val() === true);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading && !maintenanceMode) return null;

    return (
        <Modal
            visible={maintenanceMode}
            transparent={false}
            animationType="fade"
            statusBarTranslucent={true}
        >
            <View style={styles.container}>
                <View style={styles.content}>
                    <ShieldAlert size={80} color="#dc2626" style={{ marginBottom: 20 }} />
                    <Text style={styles.title}>System Under Maintenance</Text>
                    <Text style={styles.message}>
                        The Hero App is currently undergoing critical maintenance updates.
                    </Text>
                    <Text style={styles.subMessage}>
                        Please check back later. We apologize for the inconvenience.
                    </Text>

                    <View style={styles.loaderContainer}>
                        <ActivityIndicator size="large" color="#dc2626" />
                        <Text style={styles.loaderText}>Reconnecting...</Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    content: {
        alignItems: 'center',
        maxWidth: 320,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 16,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: '#4b5563',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 8,
    },
    subMessage: {
        fontSize: 14,
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 40,
    },
    loaderContainer: {
        alignItems: 'center',
    },
    loaderText: {
        marginTop: 10,
        color: '#dc2626',
        fontSize: 14,
        fontWeight: '500',
    }
});

export default MaintenanceModal;
