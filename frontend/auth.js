/**
 * auth.js - Authentication & Global Configuration for Viva Utalii
 * Updated to handle both desktop and mobile auth buttons
 */

// 1. GLOBAL CONFIGURATION
window.BACKEND_URL = 'https://viva-backend-p91j.onrender.com';

class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        // Check auth state but don't update UI yet
        const userData = localStorage.getItem('vivaUtalii_user');
        const token = localStorage.getItem('vivaUtalii_token');
        
        if (userData && token) {
            try {
                this.currentUser = JSON.parse(userData);
                console.log('Auth initialized: User found', this.currentUser.name);
            } catch (e) {
                console.error("Failed to parse user data", e);
                this.currentUser = null;
            }
        } else {
            console.log('Auth initialized: No user found');
            this.currentUser = null;
        }
    }

    // Check authentication state from localStorage
    checkAuthState() {
        const userData = localStorage.getItem('vivaUtalii_user');
        const token = localStorage.getItem('vivaUtalii_token');
        
        if (userData && token) {
            try {
                this.currentUser = JSON.parse(userData);
                this.updateAllAuthUI();
                return true;
            } catch (e) {
                console.error("Failed to parse user data", e);
                this.currentUser = null;
                this.updateAllAuthUI();
                return false;
            }
        }
        this.currentUser = null;
        this.updateAllAuthUI();
        return false;
    }

    // Login function
    async login(email, password) {
        try {
            const response = await fetch(`${window.BACKEND_URL}/login`, {
                method: 'POST',
                headers: this.getRequestHeaders(true),
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            if (response.ok && result.token) {
                localStorage.setItem('vivaUtalii_user', JSON.stringify(result.user));
                localStorage.setItem('vivaUtalii_token', result.token);
                this.currentUser = result.user;
                this.updateAllAuthUI();
                return { success: true, user: result.user };
            } else {
                return { success: false, error: result.error || 'Login failed' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error. Please try again.' };
        }
    }

    // Signup function
    async signup(name, email, password) {
        try {
            const response = await fetch(`${window.BACKEND_URL}/signup`, {
                method: 'POST',
                headers: this.getRequestHeaders(true),
                body: JSON.stringify({ name, email, password })
            });

            const result = await response.json();

            if (response.ok && result.token) {
                localStorage.setItem('vivaUtalii_user', JSON.stringify(result.user));
                localStorage.setItem('vivaUtalii_token', result.token);
                this.currentUser = result.user;
                this.updateAllAuthUI();
                return { success: true, user: result.user };
            } else {
                return { success: false, error: result.error || 'Signup failed' };
            }
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: 'Network error. Please try again.' };
        }
    }

    logout() {
        localStorage.removeItem('vivaUtalii_user');
        localStorage.removeItem('vivaUtalii_token');
        // Clear secondary keys for safety
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        
        this.currentUser = null;
        this.updateAllAuthUI(); // Update UI immediately
        window.location.href = 'index.html';
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    // NEW: Update both desktop AND mobile UI
    updateAllAuthUI() {
        // Update desktop auth buttons
        const desktopAuthButtons = document.getElementById('auth-buttons');
        
        // Update mobile auth buttons
        const mobileAuthButtons = document.getElementById('mobile-auth-buttons');
        
        if (this.isLoggedIn()) {
            // User is logged in - show profile button in both locations
            const userName = this.currentUser.name || 'Profile';
            const shortName = userName.split(' ')[0]; // Get first name only
            
            // Desktop version
            if (desktopAuthButtons) {
                desktopAuthButtons.innerHTML = `
                    <button class="profile-btn" onclick="window.location.href='profile.html'">
                        <i class="fas fa-user-circle"></i>
                        ${shortName}
                    </button>
                `;
            }
            
            // Mobile version
            if (mobileAuthButtons) {
                mobileAuthButtons.innerHTML = `
                    <button class="mobile-profile-btn" onclick="window.location.href='profile.html'">
                        <i class="fas fa-user-circle"></i>
                        ${shortName}
                    </button>
                `;
            }
            
            console.log('UI updated: Profile button shown for', userName);
        } else {
            // User is not logged in - show sign in/up buttons in both locations
            
            // Desktop version
            if (desktopAuthButtons) {
                desktopAuthButtons.innerHTML = `
                    <a href="login.html?form=login"><button>Sign In</button></a>
                    <a href="login.html?form=signup"><button>Sign Up</button></a>
                `;
            }
            
            // Mobile version
            if (mobileAuthButtons) {
                mobileAuthButtons.innerHTML = `
                    <a href="login.html?form=login"><button>Sign In</button></a>
                    <a href="login.html?form=signup"><button>Sign Up</button></a>
                `;
            }
            
            console.log('UI updated: Sign in/up buttons shown');
        }
    }

    // Legacy method for compatibility (only updates desktop)
    updateUI() {
        this.updateAllAuthUI();
    }

    // Helper method to get current user
    getUser() {
        return this.currentUser;
    }

    // Helper method to get token
    getToken() {
        return localStorage.getItem('vivaUtalii_token');
    }

    // Build headers for backend requests
    getRequestHeaders(includeContentType = true) {
        const headers = {};
        if (includeContentType) headers['Content-Type'] = 'application/json';
        const token = this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Verify token with backend
    async verifyToken() {
        const token = this.getToken();
        if (!token) return false;

        try {
            const response = await fetch(`${window.BACKEND_URL}/verify-token`, {
                method: 'GET',
                headers: this.getRequestHeaders(false)
            });

            if (!response.ok) {
                // If the backend explicitly rejects the token, log out
                if (response.status === 401) {
                    this.logout();
                    return false;
                }
                // If some other non-OK status, warn but don't force logout
                console.warn('Token verification returned non-OK status:', response.status);
                return this.isLoggedIn();
            }

            return true;
        } catch (error) {
            // Network or CORS error - warn, but preserve local token and session
            console.warn('Token verification network/CORS error — keeping local session:', error);
            return this.isLoggedIn();
        }
    }
}

// 2. INITIALIZE & EXPORT
const auth = new AuthSystem();
window.auth = auth;

// Make logout available globally
window.logout = () => auth.logout();

// Expose methods for other pages
window.getAuthHeaders = function(includeContentType = true) {
    return auth.getRequestHeaders(includeContentType);
};

window.API_BASE = window.BACKEND_URL;
window.isLoggedIn = () => auth.isLoggedIn();

// 3. AUTO-UI SYNC ON LOAD
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - updating auth UI');
    // Update both desktop and mobile UI based on current auth state
    auth.updateAllAuthUI();
    
    // Also check auth state to ensure consistency
    auth.checkAuthState();
});

// 4. Listen for storage changes (if user logs in/out in another tab)
window.addEventListener('storage', function(e) {
    if (e.key === 'vivaUtalii_token' || e.key === 'vivaUtalii_user') {
        console.log('Storage changed - updating auth state');
        auth.checkAuthState();
    }
});

// 5. Helper function for profile navigation (for use in onclick handlers)
window.goToProfile = function() {
    window.location.href = 'profile.html';
};