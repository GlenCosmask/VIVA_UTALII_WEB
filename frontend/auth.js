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
                console.error("Failed to parse user data", e);
                return false;
            }
        }
        return false;
    }

    // Login function
    async login(email, password) {
        try {
            const response = await fetch(`${window.BACKEND_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                headers: { 'Content-Type': 'application/json' },
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
        window.location.href = 'index.html';
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    updateUI() {
        const authButtons = document.getElementById('auth-buttons');
        const profileSection = document.getElementById('profile-section');
        const userNameDisplay = document.getElementById('user-name'); // Optional span for name

        if (this.isLoggedIn()) {
            if (authButtons) authButtons.style.display = 'none';
            if (profileSection) {
                profileSection.style.display = 'flex';
                if (userNameDisplay) userNameDisplay.innerText = this.currentUser.name;
            }
            // Update any loose profile buttons on the page
            const profileBtn = document.querySelector('.profile-btn');
            if (profileBtn) profileBtn.innerHTML = `👤 ${this.currentUser.name}`;
        } else {
            if (authButtons) authButtons.style.display = 'flex';
            if (profileSection) profileSection.style.display = 'none';
        }
        
        console.log('Auth state updated. User:', this.currentUser ? this.currentUser.name : 'Not logged in');
    }
}

// 2. INITIALIZE & EXPORT
const auth = new AuthSystem();
window.auth = auth;
window.logout = () => auth.logout();

// 3. AUTO-UI SYNC ON LOAD
document.addEventListener('DOMContentLoaded', () => {
    // Simple UI Check
    auth.updateUI();
});