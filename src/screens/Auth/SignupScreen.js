import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Card } from '../../components/ui';
import { submitSignupRequest } from '../../services/auth';
import { getPushTokenForSignup } from '../../services/notifications';

export default function SignupScreen({ navigation }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [employeeId, setEmployeeId] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSignup = async () => {
        if (!name || !email || !password || !employeeId || !phone) {
            Alert.alert("Error", "Please fill all fields.");
            return;
        }

        if (phone.length !== 10) {
            Alert.alert("Error", "Please enter a valid 10-digit phone number.");
            return;
        }

        setLoading(true);
        try {
            const formattedPhone = `+91${phone}`;
            // 1. Get Push Token for notifications (even without login)
            const pushToken = await getPushTokenForSignup();

            await submitSignupRequest({
                name,
                email,
                password,
                phone: formattedPhone,
                employeeId,
                pushToken
            });
            Alert.alert(
                "Request Submitted",
                "Your signup request has been submitted. Please wait for Admin approval.",
                [{ text: "OK", onPress: () => navigation.goBack() }]
            );
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to submit signup request. It might already exist.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Card style={styles.card}>
                        <Text style={styles.header}>New Account</Text>
                        <Text style={styles.subHeader}>Submit a request for access</Text>

                        <Input
                            label="Full Name"
                            value={name}
                            onChangeText={setName}
                            placeholder="e.g. Your Name"
                        />
                        <Input
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            placeholder="e.g. yourname@gmail.com"
                        />
                        <Input
                            label="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            placeholder="Min 6 characters"
                            rightIcon={
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    {showPassword ? (
                                        <EyeOff size={22} color="#6b7280" />
                                    ) : (
                                        <Eye size={22} color="#6b7280" />
                                    )}
                                </TouchableOpacity>
                            }
                        />
                        <Input
                            label="Employee ID"
                            value={employeeId}
                            onChangeText={setEmployeeId}
                            placeholder="e.g. EMP123"
                        />
                        <Input
                            label="Phone Number"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            maxLength={10}
                            placeholder="e.g. 9876543210"
                        />

                        <View style={{ height: 20 }} />

                        <Button title="Submit Request" onPress={handleSignup} loading={loading} />

                        <Button
                            title="Back to Login"
                            type="secondary"
                            onPress={() => navigation.goBack()}
                        />
                    </Card>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f3f4f6',
    },
    scrollContent: {
        padding: 20,
    },
    card: {
        padding: 20,
    },
    header: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1f2937',
        alignSelf: 'center',
        marginBottom: 4,
    },
    subHeader: {
        fontSize: 14,
        color: '#6b7280',
        alignSelf: 'center',
        marginBottom: 20,
    }
});
