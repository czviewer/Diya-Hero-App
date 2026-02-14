import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, KeyboardAvoidingView, Platform, Alert, ScrollView, Keyboard, Linking, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, Card } from '../../components/ui';
import { loginUser } from '../../services/auth';
import { MessageCircle } from 'lucide-react-native';


export default function LoginScreen({ navigation }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const passwordInputRef = React.useRef(null);

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener(
            'keyboardDidShow',
            () => {
                setKeyboardVisible(true);
            }
        );
        const keyboardDidHideListener = Keyboard.addListener(
            'keyboardDidHide',
            () => {
                setKeyboardVisible(false);
            }
        );

        return () => {
            keyboardDidHideListener.remove();
            keyboardDidShowListener.remove();
        };
    }, []);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert("Error", "Please enter both email and password.");
            return;
        }

        setLoading(true);
        try {
            await loginUser(email, password);
            // Navigation is handled by AppNavigator automatically on auth state change
        } catch (error) {
            console.error('[LoginScreen] Login error:', error);
            let msg = "Login failed.";

            // Check for device binding error
            if (error.message && error.message.includes("device")) {
                msg = error.message;
            } else if (error.message && error.message.includes("registered")) {
                msg = error.message;
            } else if (error.code === 'auth/invalid-credential') {
                msg = "Invalid email or password.";
            } else if (error.message) {
                msg = error.message;
            }

            Alert.alert("Login Failed", msg);
        } finally {
            setLoading(false);
        }
    };

    const handleHelp = () => {
        navigation.navigate('IssueReporting');
    };

    return (
        <SafeAreaView style={styles.container}>

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={[
                    styles.scrollContent,
                    isKeyboardVisible && { paddingTop: 40, justifyContent: 'flex-start' } // Adjust padding when keyboard is open
                ]}>
                    {!isKeyboardVisible && (
                        <View style={styles.header}>
                            <Image
                                source={require('../../../assets/icon-login.png')}
                                style={styles.logo}
                            />
                            <Text style={styles.subtitle}>Self Attendance System</Text>
                        </View>
                    )}

                    <Card style={styles.formCard}>
                        <Text style={styles.loginHeader}>Welcome Back</Text>
                        <Text style={styles.loginSubHeader}>Sign in to continue</Text>

                        <View style={{ height: 20 }} />

                        <Input
                            label="Email Address"
                            placeholder="Enter your email"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={setEmail}
                            returnKeyType="next"
                            onSubmitEditing={() => passwordInputRef.current?.focus()}
                            blurOnSubmit={false}
                        />

                        <Input
                            ref={passwordInputRef}
                            label="Password"
                            placeholder="Enter your password"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            returnKeyType="done"
                            onSubmitEditing={handleLogin}
                        />

                        <View style={{ height: 20 }} />

                        <Button
                            title="Login"
                            onPress={handleLogin}
                            loading={loading}
                        />

                        <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={styles.linkContainer}>
                            <Text style={styles.linkText}>New Employee? <Text style={styles.linkBold}>Sign Up</Text></Text>
                        </TouchableOpacity>
                    </Card>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>100% Secured and Real-time audited!</Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <TouchableOpacity
                style={styles.fab}
                onPress={handleHelp}
                activeOpacity={0.8}
            >
                <MessageCircle size={28} color="white" />
            </TouchableOpacity>
        </SafeAreaView >
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
    container: {
        flex: 1,
        backgroundColor: '#f3f4f6',
    },
    scrollContent: {
        flexGrow: 1,
        // justifyContent: 'center', // Previously center
        padding: 20,
        paddingTop: -18, // Move content up
    },
    header: {
        alignItems: 'center',
        marginBottom: 20,
    },
    logo: {
        width: 210,
        height: 210,
        marginBottom: -10,
        resizeMode: 'contain',
    },
    subtitle: {
        fontSize: 20,
        color: '#1a1574ff',
        marginTop: -7,
        fontWeight: '600',
    },
    formCard: {
        paddingHorizontal: 18,
        paddingVertical: 28,
    },
    loginHeader: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1f2937',
        textAlign: 'center',
    },
    loginSubHeader: {
        fontSize: 14,
        color: '#9ca3af',
        textAlign: 'center',
        marginTop: 5,
        marginBottom: 10,
    },
    linkContainer: {
        marginTop: 20,
        alignItems: 'center',
    },
    linkText: {
        fontSize: 14,
        color: '#6b7280',
    },
    linkBold: {
        color: '#b91c1c',
        fontWeight: '700',
    },
    footer: {
        marginTop: 40,
        alignItems: 'center',
        marginBottom: 20,
    },
    footerText: {
        fontSize: 12,
        color: '#9ca3af',
        textAlign: 'center',
    }
});
