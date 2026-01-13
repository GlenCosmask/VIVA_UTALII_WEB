// auth.js - Authentication system for Viva Utalii

// Backend base URL used for auth API calls
const BACKEND_URL = 'https://viva-backend-p91j.onrender.com';

class AuthSystem {

    constructor() {

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

            this.currentUser = JSON.parse(userData);

            this.updateUI();

            return true;

        }

        return false;

    }



    // Login function

    async login(email, password) {

        try {

            const response = await fetch(`${BACKEND_URL}/login`, {

                method: 'POST',

                headers: {

                    'Content-Type': 'application/json',

                },

                body: JSON.stringify({ email, password })

            });



            const result = await response.json();



            if (result.message === 'Login successful!' && result.token) {

                // Store user data and token

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

            const response = await fetch(`${BACKEND_URL}/signup`, {

                method: 'POST',

                headers: {

                    'Content-Type': 'application/json',

                },

                body: JSON.stringify({ name, email, password })

            });



            const result = await response.json();



            if (result.message === 'Account created successfully!' && result.token) {

                // Store user data and token

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



    // Logout function

    logout() {

        localStorage.removeItem('vivaUtalii_user');

        localStorage.removeItem('vivaUtalii_token');

        this.currentUser = null;

        this.updateUI();

        window.location.href = 'index.html';

    }



    // Check if user is logged in

    isLoggedIn() {

        return this.currentUser !== null;

    }



    // Get current user

    getCurrentUser() {

        return this.currentUser;

    }



    // Update UI based on auth state

    updateUI() {

        // Update profile button if it exists

        const profileBtn = document.querySelector('.profile-btn');

        if (profileBtn && this.currentUser) {

            profileBtn.innerHTML = `👤 ${this.currentUser.name || 'Profile'}`;

        }



        // You can add more UI updates here as needed

        console.log('Auth state updated. User:', this.currentUser ? this.currentUser.name : 'Not logged in');

    }



    // Check authentication and redirect if not logged in

    requireAuth(redirectTo = 'login.html') {

        if (!this.isLoggedIn()) {

            window.location.href = redirectTo;

            return false;

        }

        return true;

    }

}



// Initialize auth system

const auth = new AuthSystem();



// Global functions for backward compatibility

window.auth = auth;

window.isLoggedIn = () => auth.isLoggedIn();

window.getCurrentUser = () => auth.getCurrentUser();



// Export for module use

if (typeof module !== 'undefined' && module.exports) {

    module.exports = { auth };

}

// UI sync across pages: ensure auth-buttons and profile-section exist and toggle based on token
function ensureAuthUI() {
    // Create containers if missing
    let authButtons = document.getElementById('auth-buttons');
    let profileSection = document.getElementById('profile-section');

    // Try to find a reasonable parent for nav/auth placement
    const header = document.querySelector('header') || document.querySelector('.nav-menu') || document.body;

    if (!authButtons) {
        authButtons = document.createElement('div');
        authButtons.id = 'auth-buttons';
        authButtons.className = 'auth-buttons';
        // Move any existing login/signup anchors into this container
        header.appendChild(authButtons);
    }

    if (!profileSection) {
        // If page already has a profile button, prefer the existing one and avoid creating a new profile+logout block
        const existingProfileBtn = document.querySelector('.profile-btn');
        if (!existingProfileBtn) {
            profileSection = document.createElement('div');
            profileSection.id = 'profile-section';
            profileSection.className = 'auth-buttons';
            profileSection.style.display = 'none';
            // Profile link
            const profileLink = document.createElement('a');
            profileLink.href = 'profile.html';
            profileLink.innerHTML = '<button class="profile-btn">Profile</button>';
            // Logout button
            const logoutBtn = document.createElement('button');
            logoutBtn.innerText = 'Logout';
            logoutBtn.addEventListener('click', logout);
            profileSection.appendChild(profileLink);
            profileSection.appendChild(logoutBtn);
            header.appendChild(profileSection);
        } else {
            // Remove any page-local logout buttons to avoid duplicates; keep the single profile button
            Array.from(document.querySelectorAll('.logout-btn')).forEach(b => b.parentNode && b.parentNode.removeChild(b));
        }
    }

    // Move existing login/signup links into authButtons if they're not already inside
    const loginAnchors = Array.from(document.querySelectorAll('a[href*="login.html"], a[href*="/login.html"], a[href*="?form=login"], a[href*="?form=signup"]'));
    loginAnchors.forEach(a => {
        if (!authButtons.contains(a)) {
            // If the anchor wraps a button, move the anchor
            authButtons.appendChild(a.cloneNode(true));
            a.parentNode && a.parentNode.removeChild(a);
        }
    });

    // Also handle buttons that are plain buttons (no anchor) with signin/signup classes
    const btnSelectors = ['button.signin-btn', 'button.signup-btn', 'button.auth-btn'];
    btnSelectors.forEach(sel => {
        Array.from(document.querySelectorAll(sel)).forEach(btn => {
            if (!authButtons.contains(btn)) {
                authButtons.appendChild(btn.cloneNode(true));
                btn.parentNode && btn.parentNode.removeChild(btn);
            }
        });
    });
}

function updateAuthUI() {
    const token = localStorage.getItem('vivaUtalii_token');
    const authButtons = document.getElementById('auth-buttons');
    const profileSection = document.getElementById('profile-section');
    const existingProfileBtns = Array.from(document.querySelectorAll('.profile-btn'));
    if (token) {
        if (authButtons) authButtons.style.display = 'none';
        if (profileSection) profileSection.style.display = '';
        // Show any existing profile buttons (page-local) and remove page-local logout buttons
        existingProfileBtns.forEach(b => { b.style.display = ''; });
        Array.from(document.querySelectorAll('.logout-btn')).forEach(b => b.parentNode && b.parentNode.removeChild(b));
    } else {
        if (authButtons) authButtons.style.display = '';
        if (profileSection) profileSection.style.display = 'none';
        // Hide any existing profile buttons when not logged in
        existingProfileBtns.forEach(b => { b.style.display = 'none'; });
    }
}

function logout() {
    // Clear both naming conventions used in the app
    localStorage.removeItem('vivaUtalii_token');
    localStorage.removeItem('vivaUtalii_user');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    // Redirect to home
    window.location.href = 'index.html';
}

window.logout = logout;

document.addEventListener('DOMContentLoaded', () => {
    try {
        ensureAuthUI();
        updateAuthUI();
    } catch (e) {
        console.error('Auth UI init error:', e);
    }
});