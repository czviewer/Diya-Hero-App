import React from 'react';
import { TouchableOpacity, Text, TextInput, View, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const COLORS = {
    primary: '#b91c1c', // Red-700
    primaryLight: '#ef4444', // Red-500
    white: '#ffffff',
    grayBg: '#f3f4f6', // Gray-100
    textMain: '#1f2937', // Gray-800
    textSub: '#6b7280', // Gray-500
    error: '#ef4444',
    success: '#10b981',
};

export const Card = ({ children, style }) => (
    <View style={[styles.card, style]}>
        {children}
    </View>
);

export const Button = ({ title, onPress, type = 'primary', disabled, loading, icon }) => {
    const bgColors = type === 'primary'
        ? [COLORS.primary, COLORS.primaryLight]
        : type === 'danger' ? ['#ef4444', '#f87171']
            : type === 'secondary' ? ['#4b5563', '#6b7280'] // Visible Dark Gray
                : ['#9ca3af', '#d1d5db']; // Disabled/Neutral

    if (disabled) {
        return (
            <View style={[styles.btn, styles.btnDisabled]}>
                <Text style={styles.btnText}>{title}</Text>
            </View>
        );
    }

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
            <LinearGradient
                colors={bgColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btn}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.btnText}>{icon} {title}</Text>
                )}
            </LinearGradient>
        </TouchableOpacity>
    );
};

export const Input = React.forwardRef(({ label, icon, rightIcon, error, ...props }, ref) => (
    <View style={styles.inputContainer}>
        {label && <Text style={styles.label}>{label}</Text>}
        <View style={[styles.inputWrapper, error && styles.inputError, rightIcon && styles.inputWrapperWithIcon]}>
            <TextInput
                ref={ref}
                style={[styles.input, rightIcon && styles.inputWithIcon]}
                placeholderTextColor="#9ca3af"
                {...props}
            />
            {rightIcon && (
                <View style={styles.rightIconContainer}>
                    {rightIcon}
                </View>
            )}
        </View>
        {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
));

export const TextArea = React.forwardRef(({ label, error, maxLength, value, onChangeText, ...props }, ref) => (
    <View style={styles.inputContainer}>
        {label && <Text style={styles.label}>{label}</Text>}
        <View style={[styles.inputWrapper, styles.textAreaWrapper, error && styles.inputError]}>
            <TextInput
                ref={ref}
                style={[styles.input, styles.textArea]}
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={maxLength}
                value={value}
                onChangeText={onChangeText}
                {...props}
            />
        </View>
        <View style={styles.textAreaFooter}>
            {error && <Text style={styles.errorText}>{error}</Text>}
            {maxLength && (
                <Text style={styles.charCount}>
                    {value?.length || 0}/{maxLength}
                </Text>
            )}
        </View>
    </View>
));

export const Picker = ({ label, value, options, onValueChange, error, placeholder }) => (
    <View style={styles.inputContainer}>
        {label && <Text style={styles.label}>{label}</Text>}
        <View style={[styles.pickerWrapper, error && styles.inputError]}>
            <View style={styles.pickerContainer}>
                {options.map((option) => (
                    <TouchableOpacity
                        key={option.value}
                        style={[
                            styles.pickerOption,
                            value === option.value && styles.pickerOptionSelected
                        ]}
                        onPress={() => onValueChange(option.value)}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.pickerOptionText,
                            value === option.value && styles.pickerOptionTextSelected
                        ]}>
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
        {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
);

const styles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 20,
        marginVertical: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    btn: {
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 8,
        flexDirection: 'row',
        gap: 8,
    },
    btnDisabled: {
        backgroundColor: '#e5e7eb',
    },
    btnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textMain,
        marginBottom: 6,
        marginLeft: 4,
    },
    inputWrapper: {
        backgroundColor: '#f3f4f6', // Darker background (Gray-100)
        borderWidth: 1,
        borderColor: '#d1d5db', // Darker border (Gray-300)
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 56,
        justifyContent: 'center',
        position: 'relative',
    },
    inputWrapperWithIcon: {
        paddingRight: 50,
    },
    input: {
        fontSize: 16,
        color: COLORS.textMain,
    },
    inputWithIcon: {
        flex: 1,
    },
    rightIconContainer: {
        position: 'absolute',
        right: 16,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    inputError: {
        borderColor: COLORS.error,
    },
    errorText: {
        color: COLORS.error,
        fontSize: 12,
        marginTop: 4,
        marginLeft: 4,
    },
    textAreaWrapper: {
        height: 120,
        paddingVertical: 12,
    },
    textArea: {
        height: '100%',
    },
    textAreaFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
        marginHorizontal: 4,
    },
    charCount: {
        fontSize: 12,
        color: COLORS.textSub,
    },
    pickerWrapper: {
        backgroundColor: '#f3f4f6',
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minHeight: 56,
    },
    pickerContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    pickerOption: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#e5e7eb',
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    pickerOptionSelected: {
        backgroundColor: '#fee2e2',
        borderColor: COLORS.primary,
    },
    pickerOptionText: {
        fontSize: 14,
        color: COLORS.textMain,
        fontWeight: '500',
    },
    pickerOptionTextSelected: {
        color: COLORS.primary,
        fontWeight: '700',
    }
});
