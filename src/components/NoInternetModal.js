import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { ref, onValue } from 'firebase/database';
import { db } from '../services/firebaseConfig';
import { WifiOff } from 'lucide-react-native';

/**
 * NoInternetModal
 * 
 * Listens to Firebase RTDB's special `.info/connected` path which reflects
 * real-time connectivity to the Firebase backend — no native netinfo module needed.
 * Shows a full-screen modal when the device loses connectivity.
 * Hides automatically when connectivity is restored.
 */
const NoInternetModal = () => {
    const [isOffline, setIsOffline] = useState(true); // Start assuming offline (matched to SDK init)
    const [showModal, setShowModal] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const dotAnim1 = useRef(new Animated.Value(0.3)).current;
    const dotAnim2 = useRef(new Animated.Value(0.3)).current;
    const dotAnim3 = useRef(new Animated.Value(0.3)).current;

    // Animations...
    useEffect(() => {
        if (isOffline && showModal) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                ])
            ).start();

            const animate = (anim, delay) =>
                Animated.loop(
                    Animated.sequence([
                        Animated.delay(delay),
                        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
                        Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
                        Animated.delay(800 - delay),
                    ])
                ).start();

            animate(dotAnim1, 0);
            animate(dotAnim2, 267);
            animate(dotAnim3, 534);
        } else {
            pulseAnim.stopAnimation(); pulseAnim.setValue(1);
            dotAnim1.stopAnimation(); dotAnim1.setValue(0.3);
            dotAnim2.stopAnimation(); dotAnim2.setValue(0.3);
            dotAnim3.stopAnimation(); dotAnim3.setValue(0.3);
        }
    }, [isOffline, showModal]);

    // Listen to Firebase .info/connected — the gold standard for real connectivity
    useEffect(() => {
        const connectedRef = ref(db, '.info/connected');
        const unsubscribe = onValue(connectedRef, (snapshot) => {
            const connected = snapshot.val() === true;
            setIsOffline(!connected);
        });
        return () => unsubscribe();
    }, []);

    // hasConnectedOnce tracks whether Firebase has successfully connected at least once.
    const hasConnectedOnce = useRef(false);

    // Logic to show/hide the modal with appropriate debouncing/grace periods
    useEffect(() => {
        let timer;
        if (isOffline) {
            // If we haven't connected yet (launch phase), wait longer (5s).
            // Subsequent drops use 1.5s as usual.
            const delay = hasConnectedOnce.current ? 1500 : 5000;
            
            timer = setTimeout(() => {
                setShowModal(true);
                Animated.timing(fadeAnim, {
                    toValue: 1, duration: 300, useNativeDriver: true,
                }).start();
            }, delay);
        } else {
            // Reconnected! 
            hasConnectedOnce.current = true;
            Animated.timing(fadeAnim, {
                toValue: 0, duration: 250, useNativeDriver: true,
            }).start(() => setShowModal(false));
        }
        return () => clearTimeout(timer);
    }, [isOffline]);


    if (!showModal) return null;

    return (
        <Modal
            visible={showModal}
            transparent={true}
            animationType="none"
            statusBarTranslucent={true}
        >
            <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
                <View style={styles.card}>
                    {/* Icon */}
                    <Animated.View style={[styles.iconWrapper, { transform: [{ scale: pulseAnim }] }]}>
                        <WifiOff size={48} color="#ef4444" strokeWidth={1.8} />
                    </Animated.View>

                    {/* Text */}
                    <Text style={styles.title}>No Internet Connection</Text>
                    <Text style={styles.message}>
                        Please check your Wi-Fi or mobile data and try again.
                        The app will resume automatically when connected.
                    </Text>

                    {/* Animated dots */}
                    <View style={styles.dotsRow}>
                        {[dotAnim1, dotAnim2, dotAnim3].map((anim, i) => (
                            <Animated.View key={i} style={[styles.dot, { opacity: anim }]} />
                        ))}
                    </View>

                    <Text style={styles.waitingText}>Waiting for connection...</Text>
                </View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 24,
        padding: 36,
        alignItems: 'center',
        maxWidth: 340,
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 12,
    },
    iconWrapper: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: '#fef2f2',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1.5,
        borderColor: '#fecaca',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 12,
        textAlign: 'center',
        letterSpacing: -0.3,
    },
    message: {
        fontSize: 14,
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 28,
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },
    waitingText: {
        fontSize: 13,
        color: '#9ca3af',
        fontWeight: '500',
    },
});

export default NoInternetModal;
