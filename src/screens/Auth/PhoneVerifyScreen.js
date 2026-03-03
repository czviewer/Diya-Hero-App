import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, Input, Card } from '../../components/ui';
import { auth, db } from '../../services/firebaseConfig';
import { PhoneAuthProvider, linkWithCredential } from 'firebase/auth';
import { mobile_verifyUser } from '../../services/cloudFunctions';
import { ref, get } from 'firebase/database';

export default function PhoneVerifyScreen({ navigation, route }) {
    const webViewRef = useRef(null);
    const otpSentRef = useRef(false);
    const [last4Digits, setLast4Digits] = useState('');
    const [step, setStep] = useState('check');
    const [otp, setOtp] = useState('');
    const [verificationId, setVerificationId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showWebView, setShowWebView] = useState(false);
    const [phoneNumberForWeb, setPhoneNumberForWeb] = useState(null);

    const user = auth.currentUser;

    // On mount: if user is already verified in DB, skip OTP and go Home immediately
    useEffect(() => {
        const checkVerificationStatus = async () => {
            if (!user) return;
            try {
                const snapshot = await get(ref(db, `users/${user.uid}`));
                if (snapshot.exists() && snapshot.val().isVerified === true) {
                    navigation.replace('Home');
                }
            } catch (e) {
                // Silent - if check fails, let OTP flow continue normally
                console.log('[PhoneVerify] Status check failed:', e);
            }
        };
        checkVerificationStatus();
    }, []);

    const handleCheckLast4 = async () => {
        if (!user) {
            Alert.alert("Error", "No user logged in.");
            return;
        }
        if (last4Digits.length !== 4) {
            Alert.alert("Error", "Enter 4 digits.");
            return;
        }

        setLoading(true);
        try {
            // Fetch profile to get registered phone number (Read is allowed)
            const snapshot = await get(ref(db, `users/${user.uid}`));
            if (!snapshot.exists()) throw new Error("User profile not found.");

            const userData = snapshot.val();
            const phone = userData.phone;

            if (!phone || phone.slice(-4) !== last4Digits) {
                Alert.alert("Error", "Last 4 digits do not match registered number.");
                setLoading(false);
                return;
            }

            setPhoneNumberForWeb(phone);
            otpSentRef.current = false; // Reset guard
            setShowWebView(true);
            setLoading(false);

        } catch (error) {
            Alert.alert("Error", error.message);
            setLoading(false);
        }
    };

    const handleWebMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'success') {
                setVerificationId(data.verificationId);
                setShowWebView(false);
                setStep('otp');
                Alert.alert("OTP Sent", "Please enter the OTP sent to your phone.");
            } else if (data.type === 'error') {
                setShowWebView(false);
                Alert.alert("Verification Error", data.message);
            } else if (data.type === 'log') {
                console.log("WebView Log:", data.message);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleVerifyOtp = async () => {
        const cleanOtp = otp.trim();
        if (!cleanOtp || !verificationId) {
            Alert.alert("Error", "Please enter the OTP.");
            return;
        }
        setLoading(true);
        try {
            const credential = PhoneAuthProvider.credential(verificationId, cleanOtp);
            await linkWithCredential(user, credential);

            await mobile_verifyUser();

            Alert.alert("Success", "Phone verified!", [
                {
                    text: "OK", onPress: () => {
                        user.reload().then(() => {
                            navigation.replace('Home');
                        });
                    }
                }
            ]);
        } catch (error) {
            console.error("OTP Verification Error:", error);
            if (error.code === 'auth/credential-already-in-use') {
                await mobile_verifyUser();
                Alert.alert("Success", "Phone verified!", [
                    {
                        text: "OK", onPress: () => {
                            user.reload().then(() => {
                                navigation.replace('Home');
                            });
                        }
                    }
                ]);
            } else if (error.code === 'auth/provider-already-linked') {
                await mobile_verifyUser();
                Alert.alert("Success", "Phone verified!", [
                    {
                        text: "OK", onPress: () => {
                            user.reload().then(() => {
                                navigation.replace('Home');
                            });
                        }
                    }
                ]);
            } else if (error.code === 'auth/invalid-verification-code') {
                Alert.alert("Error", "The OTP entered is incorrect.");
            } else if (error.code === 'auth/code-expired') {
                Alert.alert("Error", "The OTP has expired. Please request a new one.");
            } else {
                Alert.alert("Error", error.message || "Verification failed.");
            }
        } finally {
            setLoading(false);
        }
    };

    const firebaseConfigJson = JSON.stringify({
        apiKey: "AIzaSyBU3K7gRzqiqQt3o9thoEpd06ReLGVmm_w",
        authDomain: "diya-hero.firebaseapp.com",
        projectId: "diya-hero",
        storageBucket: "diya-hero.firebasestorage.app",
        messagingSenderId: "455829653263",
        appId: "1:455829653263:web:5a31c65bdab2b9cee0607a"
    });

    const generateHtml = () => {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
                <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
                <style>
                <style>
                    body { 
                        display: flex; 
                        flex-direction: column; 
                        justify-content: center; 
                        align-items: center; 
                        height: 100vh; 
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        background-color: #ffffff;
                        gap: 20px;
                        margin: 0;
                    }
                    .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 2s linear infinite; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                </style>
            </head>
            <body>
                <div id="recaptcha-container"></div>
                <div id="status">Initializing...</div>
                <script>
                    const firebaseConfig = ${firebaseConfigJson};
                    firebase.initializeApp(firebaseConfig);
                    const auth = firebase.auth();
                    
                    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                        'size': 'visible',
                        'callback': (response) => {
                            document.getElementById('status').innerText = "Sending OTP...";
                        }
                    });

                    document.addEventListener("message", function(event) {
                        handleMessage(event.data);
                    });
                    window.addEventListener("message", function(event) {
                         handleMessage(event.data);
                    });

                    function handleMessage(data) {
                        try {
                            const msg = JSON.parse(data);
                            if (msg.type === 'start' && msg.phone) {
                                document.getElementById('status').innerText = "Please verify captcha...";
                                const phoneNumber = msg.phone;
                                auth.signInWithPhoneNumber(phoneNumber, window.recaptchaVerifier)
                                    .then((confirmationResult) => {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'success',
                                            verificationId: confirmationResult.verificationId
                                        }));
                                    }).catch((error) => {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'error',
                                            message: error.message
                                        }));
                                    });
                            }
                        } catch(e) {
                             window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: "Parse error: " + e.message }));
                        }
                    }
                    
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: "Ready" }));
                </script>
            </body>
            </html>
        `;
    };

    return (
        <SafeAreaView style={styles.container}>
            <Modal visible={showWebView} animationType="slide">
                <SafeAreaView style={{ flex: 1 }}>
                    <View style={{ padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontWeight: 'bold' }}>Verifying...</Text>
                        <Button title="Close" onPress={() => setShowWebView(false)} type="secondary" />
                    </View>
                    <WebView
                        originWhitelist={['*']}
                        source={{ html: generateHtml(), baseUrl: "https://diya-hero.firebaseapp.com" }}
                        javaScriptEnabled={true}
                        onMessage={handleWebMessage}
                        onLoadEnd={() => {
                            if (webViewRef.current && phoneNumberForWeb && !otpSentRef.current) {
                                otpSentRef.current = true;
                                console.log("Sending OTP start message to WebView");
                                webViewRef.current.postMessage(JSON.stringify({ type: 'start', phone: phoneNumberForWeb }));
                            }
                        }}
                        ref={webViewRef}
                    />
                </SafeAreaView>
            </Modal>

            <Card style={{ margin: 20 }}>
                {step === 'check' && (
                    <>
                        <Text style={styles.header}>Verify Identity</Text>
                        <Text style={styles.subHeader}>Enter last 4 digits of your registered phone</Text>
                        <Input
                            label="Last 4 Digits"
                            value={last4Digits}
                            onChangeText={setLast4Digits}
                            maxLength={4}
                            keyboardType="numeric"
                        />
                        <View style={{ height: 20 }} />
                        <Button title="Next" onPress={handleCheckLast4} loading={loading} />
                    </>
                )}

                {step === 'otp' && (
                    <>
                        <Text style={styles.header}>Enter OTP</Text>
                        <Text style={styles.subHeader}>Sent to registered number</Text>
                        <Input
                            label="OTP"
                            value={otp}
                            onChangeText={setOtp}
                            maxLength={6}
                            keyboardType="numeric"
                        />
                        <View style={{ height: 20 }} />
                        <Button title="Verify OTP" onPress={handleVerifyOtp} loading={loading} />
                    </>
                )}
            </Card>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f3f4f6' },
    header: { fontSize: 24, fontWeight: 'bold', alignSelf: 'center', marginBottom: 10 },
    subHeader: { fontSize: 14, color: '#666', alignSelf: 'center', marginBottom: 20 }
});
