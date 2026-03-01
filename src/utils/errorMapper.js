/**
 * Maps technical error codes (Firebase/Server) to user-friendly "Direct Issue" messages.
 */
export const mapErrorToMessage = (error) => {
    if (!error) return "An unexpected error occurred.";

    const code = error.code || '';
    const message = error.message || '';

    // Firebase Auth specific
    if (code === 'auth/user-disabled' || message.includes('user-disabled')) {
        return "Your account has been suspended. Please contact your administrator.";
    }
    if (code === 'auth/invalid-credential' || message.includes('invalid-credential')) {
        return "Invalid email or password. Please try again.";
    }
    if (code === 'auth/too-many-requests' || message.includes('too-many-requests')) {
        return "Too many failed attempts. Your account is temporarily locked for security. Please try again later.";
    }
    if (code === 'auth/network-request-failed' || message.includes('network-request-failed')) {
        return "Network connection issue. Please check your internet connection.";
    }
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        return "Invalid email or password.";
    }
    if (code === 'auth/email-already-in-use') {
        return "This email is already associated with another account.";
    }

    // Custom App Logic (from services/auth.js)
    if (message.includes("device") || message.includes("binding")) {
        return message; // Usually already friendly: "This device is not bound..."
    }

    if (message.includes("deactivated")) {
        return "Your account has been deactivated. Please contact your administrator.";
    }

    // Default Fallback
    return "Something went wrong. Please try again or report the issue.";
};
