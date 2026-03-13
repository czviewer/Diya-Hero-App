// app.config.js
// Dynamic Expo config - replaces app.json so Firebase config can be read from .env
// Expo SDK 49+ automatically loads .env files. Vars prefixed EXPO_PUBLIC_ are
// available at runtime via process.env. We pass them through extra.firebase so
// the rest of the app can read them from Constants.expoConfig.extra.firebase

const IS_DEV = process.env.APP_VARIANT === 'development';

export default ({ config }) => ({
    ...config,
    name: "Diya-Hero App",
    slug: "attendance-mobile",
    version: "1.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
    },
    ios: {
        supportsTablet: true,
        buildNumber: "1",
        infoPlist: {
            NSLocationWhenInUseUsageDescription: "This app needs access to your location to verify you are at the correct branch for attendance marking.",
            NSLocationAlwaysAndWhenInUseUsageDescription: "This app needs access to your location to verify you are at the correct branch for attendance marking."
        },
        entitlements: {
            "com.apple.developer.networking.wifi-info": true
        },
        bundleIdentifier: "com.diyagroup.attendance"
    },
    android: {
        adaptiveIcon: {
            foregroundImage: "./assets/adaptive-icon.png",
            backgroundColor: "#ffffff"
        },
        versionCode: 3,
        permissions: [
            "ACCESS_COARSE_LOCATION",
            "ACCESS_FINE_LOCATION",
            "android.permission.ACCESS_COARSE_LOCATION",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.REQUEST_INSTALL_PACKAGES"
        ],
        package: "com.diyagroup.attendance",
        googleServicesFile: "./google-services.json"
    },
    plugins: [
        [
            "expo-location",
            {
                locationAlwaysAndWhenInUsePermission: "This app needs access to your location to verify you are at the correct branch for attendance marking."
            }
        ],
        [
            "expo-notifications",
            {
                icon: "./assets/notification-icon.png",
                color: "#6366f1"
            }
        ],
        "expo-secure-store",
        [
            "expo-local-authentication",
            {
                faceIDPermission: "Allow Diya-Hero App to use Face ID for secure access."
            }
        ],
        "@react-native-firebase/app",
        "@react-native-firebase/app-check"
    ],
    web: {
        favicon: "./assets/favicon.png"
    },
    updates: {
        url: "https://u.expo.dev/8636fb20-0d1c-416a-bac7-ab12a14b80b1",
        fallbackToCacheTimeout: 0
    },
    extra: {
        eas: {
            projectId: "8636fb20-0d1c-416a-bac7-ab12a14b80b1"
        },
        // Firebase config — populated from .env at build time (never hardcoded)
        firebase: {
            apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
            databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
            projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
            measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
        }
    },
    runtimeVersion: {
        policy: "appVersion"
    },
    owner: "karthikrr"
});
