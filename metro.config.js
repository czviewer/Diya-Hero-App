const { getDefaultConfig } = require('expo/metro-config');
const obfuscator = require('obfuscator-io-metro-plugin');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
    transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
    },
});

config.transformer = {
    ...config.transformer,
    // This is the obfuscator configuration
    ...obfuscator({
        // Performance & Security Balance
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        numbersToExpressions: true,
        simplify: true,
        shuffleStringArray: true,
        splitStrings: true,
        stringArray: true,
        stringArrayThreshold: 0.75,
        rotateStringArray: true,
        deadCodeInjection: false, // Turned off to prevent excessive bundle size

        // Safety Exclusions
        // We only obfuscate our source code to prevent breaking third-party libraries
        sourceMap: false,
        inputFileName: null,
        log: false,
        renameGlobals: false,

        // Core Exclusions (Firebase, React Native, etc)
        reservedNames: [
            'Firebase', 'firebase', 'FirebaseApp', 'Auth', 'Database', 'appCheck',
            'ExpoVpnChecker', 'checkVpn', 'isVpnActive',
            'global', 'require', 'module', 'exports', 'App', 'index'
        ],
        reservedStrings: [
            'firebase', 'firestore', 'database', 'auth', 'app-check',
            'Play Integrity', 'playIntegrity'
        ],
    }, {
        // Specify which files to obfuscate. Focused on 'src'
        filter: (filename) => {
            // Obfuscate our app code
            if (filename.indexOf('src/') !== -1 || filename === 'App.js') {
                return true;
            }
            return false;
        }
    }),
};

module.exports = config;
