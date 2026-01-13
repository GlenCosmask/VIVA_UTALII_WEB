/**
 * auth.js - Authentication & Global Configuration for Viva Utalii
 */

// 1. GLOBAL CONFIGURATION
// Attached to window so it's accessible in plan.html and recommendations.html
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
                this.updateUI();
                return true;
            } catch (e) {
                console.error("Failed to parse user data", e);
                this.currentUser = null;
                this.updateUI();
                return false;
            }
        }
        this.currentUser = null;
        this.updateUI();
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
                this.updateUI();
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
                this.updateUI();
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
        this.updateUI(); // Update UI immediately
        window.location.href = 'index.html';
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    updateUI() {
        const authButtons = document.getElementById('auth-buttons');

        if (!authButtons) {
            console.log('auth-buttons element not found on this page');
            return;
        }

        if (this.isLoggedIn()) {
            // User is logged in - show profile button
            authButtons.innerHTML = `
                <button class="profile-btn" onclick="window.location.href='profile.html'">
                    <i class="fas fa-user"></i> ${this.currentUser.name || 'Profile'}
                </button>
            `;
            console.log('UI updated: Profile button shown for', this.currentUser.name);
        } else {
            // User is not logged in - show sign in/up buttons
            authButtons.innerHTML = `
                <a href="login.html?form=login"><button>Sign In</button></a>
                <a href="login.html?form=signup"><button>Sign Up</button></a>
            `;
            console.log('UI updated: Sign in/up buttons shown');
        }
    }

    // Helper method to get current user
    getUser() {
        return this.currentUser;
    }

    // Helper method to get token
    getToken() {
        return localStorage.getItem('vivaUtalii_token');
    }

    // Build headers for backend requests; include Authorization only when token exists
    getRequestHeaders(includeContentType = true) {
        const headers = {};
        if (includeContentType) headers['Content-Type'] = 'application/json';
        const token = this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Verify token with backend (resilient to network/CORS failures)
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

// Backwards compatibility: expose a global getAuthHeaders() used by existing pages
window.getAuthHeaders = function(includeContentType = true) {
    return auth.getRequestHeaders(includeContentType);
};

// Expose API base for pages that reference API_BASE
window.API_BASE = window.BACKEND_URL;

// 3. AUTO-UI SYNC ON LOAD
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - updating UI from auth.js');
    // Update UI based on current auth state
    auth.updateUI();
});

// 4. Listen for storage changes (if user logs in/out in another tab)
window.addEventListener('storage', function(e) {
    if (e.key === 'vivaUtalii_token' || e.key === 'vivaUtalii_user') {
        console.log('Storage changed - updating auth state');
        auth.checkAuthState();
    }
});