// auth.js - Authentication system for Viva Utalii
class AuthSystem {
    constructor() {
        // Base URL for your Render backend
        this.API_BASE_URL = 'https://viva-backend-p91j.onrender.com';
        this.currentUser = null;
        this.init();
    }

    init() {
        // Check if user is logged in on page load
        this.checkAuthState();
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
                console.error("Error parsing user data", e);
                this.logout(); // Clear corrupted data
                return false;
            }
        }
        return false;
    }

    // Login function
    async login(email, password) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            // Checking for 200 OK status or specific success message
            if (response.ok && result.token) {
                this.saveSession(result.user, result.token);
                return { success: true, user: result.user };
            } else {
                return { success: false, error: result.message || result.error || 'Login failed' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Connection to server failed. Please try again.' };
        }
    }

    // Signup function
    async signup(name, email, password) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email, password })
            });

            const result = await response.json();

            if (response.ok && result.token) {
                this.saveSession(result.user, result.token);
                return { success: true, user: result.user };
            } else {
                return { success: false, error: result.message || result.error || 'Signup failed' };
            }
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: 'Connection to server failed. Please try again.' };
        }
    }

    // Helper to save session data
    saveSession(user, token) {
        localStorage.setItem('vivaUtalii_user', JSON.stringify(user));
        localStorage.setItem('vivaUtalii_token', token);
        this.currentUser = user;
        this.updateUI();
    }

    // Logout function
    logout() {
        localStorage.removeItem('vivaUtalii_user');
        localStorage.removeItem('vivaUtalii_token');
        this.currentUser = null;
        this.updateUI();
        // Adjust redirect path if your login page is in a different folder
        window.location.href = 'index.html';
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    // Get the JWT token for authenticated API calls
    getToken() {
        return localStorage.getItem('vivaUtalii_token');
    }

    updateUI() {
        const profileBtn = document.querySelector('.profile-btn');
        if (profileBtn) {
            if (this.currentUser) {
                profileBtn.innerHTML = `👤 ${this.currentUser.name || 'Profile'}`;
            } else {
                profileBtn.innerHTML = `👤 Login`;
            }
        }
        console.log('Auth state:', this.currentUser ? `Logged in as ${this.currentUser.email}` : 'Logged out');
    }

    requireAuth(redirectTo = 'login.html') {
        if (!this.isLoggedIn()) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }
}

// Initialize and attach to window
const auth = new AuthSystem();
window.auth = auth;

// Compatibility exports
window.isLoggedIn = () => auth.isLoggedIn();
window.getCurrentUser = () => auth.getCurrentUser();