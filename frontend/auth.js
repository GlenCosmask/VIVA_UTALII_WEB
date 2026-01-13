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