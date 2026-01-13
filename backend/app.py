from flask import Flask, request, jsonify, session
import sqlite3
import os
from flask_cors import CORS
import secrets
import requests
import threading
import time
import base64
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'supersecretkey'

# Session configuration
app.config.update(
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=False,
    SESSION_COOKIE_HTTPONLY=True,
    PERMANENT_SESSION_LIFETIME=3600
)

DB = 'viva_utalii.db'

# FIXED CORS: Allow all ports from localhost and 127.0.0.1
CORS(app, resources={r"/*": {"origins": "*"}})

# ------------------- M-Pesa Daraja credentials (HARDCODED) -------------------
CONSUMER_KEY = "MYO5kqmnAhdpKIbNlNoQnSweJ0KgxMImMGNiEG61Uc7XOAwD"
CONSUMER_SECRET = "VkrHkM3xur8GzLPklzxsKgE0DQx9H8FYnv08bFeCVjThl6kW3Q8hq2T13EQgmmz7"
BUSINESS_SHORT_CODE = "174379"
PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"
CALLBACK_URL = "https://siphonal-corny-dawson.ngrok-free.dev/api/mpesa_callback"

# ------------------- In-memory store for STK requests -------------------
stk_requests = {}  # key: CheckoutRequestID, value: {'phone':..., 'amount':..., 'status':...}

def get_db_connection():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        ''')
        
        # Add deals table
        cur.execute('''
            CREATE TABLE IF NOT EXISTS deals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                destination TEXT NOT NULL,
                discount TEXT NOT NULL
            )
        ''')
        
        # Add bookings table
        cur.execute('''
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                destination_id TEXT NOT NULL,
                dest_name TEXT NOT NULL,
                arrive_date TEXT NOT NULL,
                depart_date TEXT NOT NULL,
                travelers INTEGER NOT NULL,
                acc_tier TEXT NOT NULL,
                total_cost INTEGER NOT NULL,
                deposit_amount INTEGER NOT NULL,
                paid_deposit BOOLEAN DEFAULT FALSE,
                mpesa_phone TEXT,
                mpesa_reference TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # Add a test user if none exists
        cur.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] == 0:
            cur.execute("INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
                       ("John Doe", "john@example.com", "password123"))
            print("✅ Test user created: john@example.com / password123")
        
        # Add sample deals
        cur.execute("SELECT COUNT(*) FROM deals")
        if cur.fetchone()[0] == 0:
            sample_deals = [
                ("Maasai Mara", "15% off for newsletter subscribers"),
                ("Zanzibar", "All-inclusive package discount"),
                ("Diani Beach", "30% OFF flash sale")
            ]
            cur.executemany("INSERT INTO deals (destination, discount) VALUES (?, ?)", sample_deals)
            print("✅ Sample deals added")
        
        conn.commit()
        conn.close()
        print("✅ Database initialized successfully!")
        
    except Exception as e:
        print(f"❌ Database initialization error: {e}")

# Initialize database
print("🔄 Starting database initialization...")
init_db()

# Store active sessions in memory
active_sessions = {}

def get_user():
    # Check session first
    if 'user_id' in session:
        user_id = session['user_id']
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT id, name, email FROM users WHERE id=?", (user_id,))
            row = cur.fetchone()
            conn.close()
            if row:
                return {'id': row[0], 'name': row[1], 'email': row[2]}
        except Exception as e:
            print(f"Error getting user from session: {e}")
    
    # Fallback to checking Authorization header
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        if token in active_sessions:
            user_id = active_sessions[token]
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT id, name, email FROM users WHERE id=?", (user_id,))
                row = cur.fetchone()
                conn.close()
                if row:
                    return {'id': row[0], 'name': row[1], 'email': row[2]}
            except Exception as e:
                print(f"Error getting user from token: {e}")
    
    return None

# ------------------- M-Pesa Functions -------------------
def get_access_token():
    url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    try:
        r = requests.get(url, auth=(CONSUMER_KEY, CONSUMER_SECRET), timeout=30)
        r.raise_for_status()
        return r.json().get("access_token")
    except requests.exceptions.RequestException as e:
        print(f"Error getting access token: {e}")
        return None

def daraja_timestamp():
    return datetime.now().strftime("%Y%m%d%H%M%S")

# ------------------- M-Pesa Routes -------------------
@app.route("/api/mpesa/stkpush", methods=['POST', 'OPTIONS'])
def stk_push():
    print(f"🎯 STK Push request received from origin: {request.headers.get('Origin')}")
    
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        data = request.get_json()
        print(f"📦 STK Push data: {data}")
        
        # Validate required fields
        if not data:
            return jsonify({"success": False, "error": "No JSON data provided"}), 400
            
        phone = data.get("phone")
        amount = data.get("amount")
        account_ref = data.get("account_reference", "VIVAUTALII")
        desc = data.get("description", "Travel booking deposit")

        # Validate phone and amount
        if not phone:
            return jsonify({"success": False, "error": "Phone number is required"}), 400
            
        try:
            amount = int(amount)
            if amount <= 0:
                return jsonify({"success": False, "error": "Amount must be greater than 0"}), 400
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "Invalid amount"}), 400

        # Get access token
        print("🔑 Getting M-Pesa access token...")
        access_token = get_access_token()
        if not access_token:
            return jsonify({"success": False, "error": "Failed to get access token"}), 500

        headers = {
            "Authorization": f"Bearer {access_token}", 
            "Content-Type": "application/json"
        }

        # Prepare password
        timestamp = daraja_timestamp()
        password_str = BUSINESS_SHORT_CODE + PASSKEY + timestamp
        password = base64.b64encode(password_str.encode()).decode()

        # Prepare payload
        payload = {
            "BusinessShortCode": BUSINESS_SHORT_CODE,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": amount,
            "PartyA": phone,
            "PartyB": BUSINESS_SHORT_CODE,
            "PhoneNumber": phone,
            "CallBackURL": CALLBACK_URL,
            "AccountReference": account_ref,
            "TransactionDesc": desc
        }

        print(f"📤 Sending STK push to M-Pesa: {payload}")

        try:
            resp = requests.post(
                "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
                headers=headers, 
                json=payload,
                timeout=30
            )
            resp.raise_for_status()
            result = resp.json()
            print(f"📥 M-Pesa response: {result}")
            
            # Check if request was successful
            if "ResponseCode" in result and result["ResponseCode"] == "0":
                checkout_id = result.get("CheckoutRequestID")
                merchant_id = result.get("MerchantRequestID")
                
                if checkout_id:
                    stk_requests[checkout_id] = {
                        "phone": phone, 
                        "amount": amount, 
                        "status": "pending",
                        "merchant_request_id": merchant_id,
                        "timestamp": datetime.now().isoformat()
                    }
                    
                return jsonify({
                    "success": True,
                    "message": "STK push initiated successfully",
                    "checkout_request_id": checkout_id,
                    "merchant_request_id": merchant_id,
                    "response": "Please check your phone to complete the payment"
                })
            else:
                error_message = result.get("errorMessage", "STK push failed")
                print(f"❌ M-Pesa error: {error_message}")
                return jsonify({
                    "success": False,
                    "error": error_message
                }), 400
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Network error: {e}")
            return jsonify({
                "success": False, 
                "error": f"Network error: {str(e)}"
            }), 500
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            return jsonify({
                "success": False, 
                "error": f"Unexpected error: {str(e)}"
            }), 500
            
    except Exception as e:
        print(f"❌ Request processing error: {e}")
        return jsonify({
            "success": False, 
            "error": f"Request processing error: {str(e)}"
        }), 500

@app.route("/api/mpesa/query", methods=['POST', 'OPTIONS'])
def stk_query():
    if request.method == 'OPTIONS':
        return '', 200
        
    data = request.get_json()
    checkout_id = data.get("CheckoutRequestID")
    
    if not checkout_id:
        return jsonify({"success": False, "error": "Missing CheckoutRequestID"}), 400

    status_info = stk_requests.get(checkout_id)
    if not status_info:
        return jsonify({"success": False, "error": "CheckoutRequestID not found"}), 404

    # Return current status
    return jsonify({
        "success": True,
        "checkout_request_id": checkout_id,
        "status": status_info["status"],
        "phone": status_info["phone"],
        "amount": status_info["amount"]
    })

@app.route("/api/mpesa_callback", methods=['POST'])
def stk_callback():
    try:
        data = request.get_json()
        print(f"🎯 M-Pesa Callback received: {data}")
        
        if not data or "Body" not in data or "stkCallback" not in data["Body"]:
            return jsonify({"ResultCode": 1, "ResultDesc": "Invalid callback format"}), 400

        callback = data["Body"]["stkCallback"]
        checkout_id = callback.get("CheckoutRequestID")
        result_code = callback.get("ResultCode")
        
        if not checkout_id:
            return jsonify({"ResultCode": 1, "ResultDesc": "Missing CheckoutRequestID"}), 400

        # Update status based on result code
        if result_code == 0:
            status = "success"
            result_desc = "Payment completed successfully"
            print(f"✅ Payment SUCCESS for {checkout_id}")
        else:
            status = "failed"
            result_desc = callback.get("ResultDesc", "Payment failed")
            print(f"❌ Payment FAILED for {checkout_id}: {result_desc}")

        # Update in-memory store
        if checkout_id in stk_requests:
            stk_requests[checkout_id]["status"] = status
            stk_requests[checkout_id]["callback_data"] = data
            stk_requests[checkout_id]["updated_at"] = datetime.now().isoformat()
            
        print(f"📝 Callback processed: {checkout_id} -> {status}")
        return jsonify({"ResultCode": 0, "ResultDesc": "Success"})
        
    except Exception as e:
        print(f"❌ Callback processing error: {e}")
        return jsonify({"ResultCode": 1, "ResultDesc": f"Error: {str(e)}"}), 500

@app.route("/api/mpesa/requests", methods=['GET'])
def get_requests():
    return jsonify({
        "success": True,
        "total_requests": len(stk_requests),
        "requests": stk_requests
    })

@app.route("/api/health", methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "total_pending_requests": len([r for r in stk_requests.values() if r.get("status") == "pending"]),
        "cors_enabled": True,
        "allowed_origins": "ALL PORTS"
    })


@app.route('/health')
def health():
    return {"status": "alive"}, 200

# ------------------- Existing Application Routes -------------------
# SIGNUP AND LOGIN ROUTES
@app.route('/signup', methods=['POST', 'OPTIONS'])
def signup():
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()
        
        if not name or not email or not password:
            return jsonify({'error': 'All fields are required'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT id FROM users WHERE email=?", (email,))
        if cur.fetchone():
            conn.close()
            return jsonify({'error': 'Email already registered'}), 400
        
        cur.execute("INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
                   (name, email, password))
        conn.commit()
        
        # Get the new user ID
        cur.execute("SELECT id FROM users WHERE email=?", (email,))
        user_id = cur.fetchone()[0]
        conn.close()
        
        # Create session and token
        session['user_id'] = user_id
        session['email'] = email
        
        # Also create a token for alternative authentication
        token = secrets.token_hex(16)
        active_sessions[token] = user_id
        
        print(f"✅ User created and logged in: {email} (ID: {user_id})")
        
        return jsonify({
            'message': 'Account created successfully!',
            'token': token,
            'user': {'name': name, 'email': email}
        }), 200
        
    except Exception as e:
        print(f"❌ Signup error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()
        
        print(f"🔐 Login attempt for: {email}")
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT id, name, email, password FROM users WHERE email=?", (email,))
        user = cur.fetchone()
        conn.close()
        
        if user and user[3] == password:
            # Set session
            session['user_id'] = user[0]
            session['email'] = user[2]
            
            # Create token for alternative auth
            token = secrets.token_hex(16)
            active_sessions[token] = user[0]
            
            print(f"✅ Login successful: {email} (ID: {user[0]})")
            
            return jsonify({
                'message': 'Login successful!',
                'token': token,
                'user': {'name': user[1], 'email': user[2]}
            }), 200
        else:
            print(f"❌ Login failed for: {email}")
            return jsonify({'error': 'Invalid email or password'}), 401
            
    except Exception as e:
        print(f"❌ Login error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/check_login', methods=['GET'])
def check_login():
    user = get_user()
    return jsonify({'logged_in': user is not None, 'user': user})

# PROFILE PAGE ROUTES
@app.route('/get_user_info', methods=['GET', 'OPTIONS'])
def get_user_info():
    if request.method == 'OPTIONS':
        return '', 200
    
    user = get_user()
    if user:
        return jsonify({
            'name': user['name'],
            'email': user['email']
        })
    return jsonify({'error': 'Not logged in'}), 401

@app.route('/get_travel_history', methods=['GET', 'OPTIONS'])
def get_travel_history():
    if request.method == 'OPTIONS':
        return '', 200
    user = get_user()
    if not user:
        return jsonify([]), 401
    
    sample_history = [
        {'destination': 'Maasai Mara', 'start_date': '2024-01-15', 'end_date': '2024-01-20', 'status': 'Completed'},
        {'destination': 'Diani Beach', 'start_date': '2024-03-10', 'end_date': '2024-03-17', 'status': 'Completed'}
    ]
    return jsonify(sample_history)

@app.route('/get_bookings', methods=['GET', 'OPTIONS'])
def get_bookings():
    if request.method == 'OPTIONS':
        return '', 200
    user = get_user()
    if not user:
        return jsonify([]), 401
    
    sample_bookings = [
        {'destination': 'Mount Kenya', 'date': '2024-12-15', 'status': 'Confirmed', 'fee_paid': True},
        {'destination': 'Amboseli National Park', 'date': '2025-02-20', 'status': 'Pending', 'fee_paid': False}
    ]
    return jsonify(sample_bookings)

@app.route('/get_deals', methods=['GET', 'OPTIONS'])
def get_deals():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT destination, discount FROM deals")
        rows = cur.fetchall()
        conn.close()
        deals = [{'destination': row[0], 'discount': row[1]} for row in rows]
        return jsonify(deals)
    except Exception as e:
        print(f"Error getting deals: {e}")
        # Return sample deals if database error
        return jsonify([
            {'destination': 'Maasai Mara', 'discount': '15% off for newsletter subscribers'},
            {'destination': 'Zanzibar', 'discount': 'All-inclusive package discount'},
            {'destination': 'Diani Beach', 'discount': '30% OFF flash sale'}
        ])

@app.route('/generate_newsletter', methods=['POST', 'OPTIONS'])
def generate_newsletter():
    if request.method == 'OPTIONS':
        return '', 200
    user = get_user()
    if not user:
        return jsonify({'message': 'Please log in first'}), 401
    return jsonify({'message': 'Monthly newsletter has been sent to your email!'})

@app.route('/cancel_booking', methods=['POST', 'OPTIONS'])
def cancel_booking():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.get_json()
        destination = data.get('destination')
        user = get_user()
        if not user:
            return jsonify({'message': 'Not logged in'}), 401
        return jsonify({'message': f'Booking for {destination} cancelled successfully!'})
    except Exception as e:
        return jsonify({'message': 'Error cancelling booking'}), 500

@app.route('/update_password', methods=['POST', 'OPTIONS'])
def update_password():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.get_json()
        new_password = data.get('newPassword')
        user = get_user()
        if not user:
            return jsonify({'message': 'Not logged in'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE users SET password=? WHERE id=?", (new_password, user['id']))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Password updated successfully!'})
    except Exception as e:
        return jsonify({'message': 'Error updating password'}), 500

@app.route('/update_email', methods=['POST', 'OPTIONS'])
def update_email():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.get_json()
        new_email = data.get('newEmail')
        user = get_user()
        if not user:
            return jsonify({'message': 'Not logged in'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if email already exists
        cur.execute("SELECT id FROM users WHERE email=? AND id != ?", (new_email, user['id']))
        if cur.fetchone():
            conn.close()
            return jsonify({'message': 'Email already in use by another account'}), 400
        
        cur.execute("UPDATE users SET email=? WHERE id=?", (new_email, user['id']))
        conn.commit()
        conn.close()
        session['email'] = new_email
        return jsonify({'message': 'Email updated successfully!'})
    except Exception as e:
        return jsonify({'message': 'Error updating email'}), 500

@app.route('/delete_account', methods=['POST', 'OPTIONS'])
def delete_account():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        user = get_user()
        if not user:
            return jsonify({'message': 'Not logged in'}), 401
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE id=?", (user['id'],))
        conn.commit()
        conn.close()
        session.clear()
        return jsonify({'message': 'Account deleted successfully!'})
    except Exception as e:
        return jsonify({'message': 'Error deleting account'}), 500

@app.route('/test')
def test():
    user = get_user()
    return jsonify({
        'status': 'Backend is working!', 
        'logged_in': user is not None,
        'user': user,
        'cors_ports': 'ALL PORTS NOW ALLOWED',
        'mpesa_endpoints': 'ACTIVE - /api/mpesa/stkpush available'
    })

@app.route('/debug')
def debug():
    return jsonify({
        'session': dict(session),
        'active_sessions_count': len(active_sessions),
        'cors_enabled': True,
        'stk_requests_count': len(stk_requests)
    })

@app.route('/logout', methods=['POST', 'OPTIONS'])
def logout():
    if request.method == 'OPTIONS':
        return '', 200
        
    # Clear session
    session.clear()
    
    # Clear token if provided
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        active_sessions.pop(token, None)
    
    return jsonify({'message': 'Logged out successfully'})

if __name__ == "__main__":
    print("🚀 Starting Viva Utalii Backend...")
    print("📍 Running on: http://127.0.0.1:5000")
    print("🔗 Test endpoint: http://127.0.0.1:5000/test")
    print("🌐 CORS enabled for ALL PORTS from localhost and 127.0.0.1")
    print("💰 M-Pesa Integration: ACTIVE (Sandbox Mode)")
    print("👤 Test credentials: john@example.com / password123")
    print("✅ Backend ready - CORS will now work with ANY frontend port!")
    # Background keep-alive thread to ping the Render health endpoint periodically
    def keep_alive():
        url = "https://viva-backend-p91j.onrender.com/health"
        while True:
            try:
                requests.get(url, timeout=10)
                print("Self-ping successful: Backend is awake.")
            except Exception as e:
                print(f"Self-ping failed: {e}")
            # Wait 14 minutes (Render sleeps after ~15 minutes)
            time.sleep(840)

    threading.Thread(target=keep_alive, daemon=True).start()

    app.run(debug=True, port=5000)