import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Card, Input, Button } from './ui';
import { X, KeyRound } from 'lucide-react-native';
import { sendMobilePasswordReset } from '../services/auth';

const ForgotPasswordModal = ({ visible, onClose, initialEmail }) => {
    const [email, setEmail] = useState(initialEmail || '');
    const [loading, setLoading] = useState(false);

    const handleReset = async () => {
        if (!email) {
            Alert.alert("Error", "Please enter your email address.");
            return;
        }

        setLoading(true);
        try {
            await sendMobilePasswordReset(email);
            Alert.alert(
                "Reset Link Sent",
                "A password reset link has been sent to your email. Please check your inbox (and spam folder).",
                [{ text: "OK", onPress: onClose }]
            );
        } catch (error) {
            Alert.alert("Error", error.message || "Failed to send reset email. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Card style={styles.modalCard}>
                    <View style={styles.header}>
                        <View style={styles.titleContainer}>
                            <KeyRound size={20} color="#b91c1c" style={{ marginRight: 8 }} />
                            <Text style={styles.title}>Reset Password</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} disabled={loading} style={styles.closeBtn}>
                            <X size={24} color="#6b7280" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.description}>
                        Enter your registered email address and we'll send you a link to choose a new password.
                    </Text>

                    <Input
                        label="Email Address"
                        placeholder="Enter your email"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={!loading}
                    />

                    <View style={{ height: 10 }} />

                    <Button
                        title="Send Reset Link"
                        onPress={handleReset}
                        loading={loading}
                        disabled={loading}
                    />
                </Card>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalCard: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#1f2937',
    },
    closeBtn: {
        padding: 4,
    },
    description: {
        fontSize: 15,
        color: '#4b5563',
        marginBottom: 24,
        lineHeight: 22,
    }
});

export default ForgotPasswordModal;
