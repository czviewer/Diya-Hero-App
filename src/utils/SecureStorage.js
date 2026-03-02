import * as SecureStore from 'expo-secure-store';

const SecureStorage = {
    getItem: async (key) => {
        try {
            return await SecureStore.getItemAsync(key);
        } catch (e) {
            console.error('[SecureStorage] getItem error:', e);
            return null;
        }
    },
    setItem: async (key, value) => {
        try {
            await SecureStore.setItemAsync(key, value);
        } catch (e) {
            console.error('[SecureStorage] setItem error:', e);
        }
    },
    removeItem: async (key) => {
        try {
            await SecureStore.deleteItemAsync(key);
        } catch (e) {
            console.error('[SecureStorage] removeItem error:', e);
        }
    },
};

export default SecureStorage;
