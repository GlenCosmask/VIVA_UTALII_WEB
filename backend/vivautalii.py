from flask import Flask, request, jsonify, session
import sqlite3
import os
from flask_cors import CORS
import secrets
import requests
import base64
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Get configuration from environment variables
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'supersecretkey')

# Session configuration from environment variables
app.config.update(
    SESSION_COOKIE_SAMESITE=os.getenv('SESSION_COOKIE_SAMESITE', 'Lax'),
    SESSION_COOKIE_SECURE=os.getenv('SESSION_COOKIE_SECURE', 'False').lower() == 'true',
    SESSION_COOKIE_HTTPONLY=os.getenv('SESSION_COOKIE_HTTPONLY', 'True').lower() == 'true',
    PERMANENT_SESSION_LIFETIME=int(os.getenv('PERMANENT_SESSION_LIFETIME', '3600'))
)

DB = os.getenv('DATABASE_URL', 'viva_utalii.db')

# DYNAMIC CORS CONFIGURATION FROM .env
cors_origins = os.getenv('CORS_ORIGINS', '')
if cors_origins:
    # Split the comma-separated origins from .env
    allowed_origins = [origin.strip() for origin in cors_origins.split(',')]
else:
    # Fallback to default development origins
    allowed_origins = ['http://127.0.0.1:*', 'http://localhost:*']

print(f"🌐 CORS Allowed Origins: {allowed_origins}")

# ULTIMATE CORS FIX - Using environment configuration
CORS(app, 
     origins=allowed_origins,
     supports_credentials=True,
     allow_headers=['*'],
     methods=['*']
)

# ------------------- M-Pesa Daraja credentials (HARDCODED) -------------------
CONSUMER_KEY = "MYO5kqmnAhdpKIbNlNoQnSweJ0KgxMImMGNiEG61Uc7XOAwD"
CONSUMER_SECRET = "VkrHkM3xur8GzLPklzxsKgE0DQx9H8FYnv08bFeCVjThl6kW3Q8hq2T13EQgmmz7"
BUSINESS_SHORT_CODE = "174379"
PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"
CALLBACK_URL = os.getenv('MPESA_CALLBACK_URL', 'https://siphonal-corny-dawson.ngrok-free.dev/api/mpesa_callback')

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

# ------------------- MANUAL CORS HANDLING FOR CRITICAL ROUTES -------------------
@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'preflight'})
        origin = request.headers.get('Origin')
        if origin in allowed_origins or any(origin.startswith(allowed.replace(':*', '')) for allowed in allowed_origins if ':*' in allowed):
            response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Headers', '*')
        response.headers.add('Access-Control-Allow-Methods', '*')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

@app.after_request
def after_request(response):
    """Add CORS headers to all responses"""
    origin = request.headers.get('Origin')
    if origin in allowed_origins or any(origin and origin.startswith(allowed.replace(':*', '')) for allowed in allowed_origins if ':*' in allowed):
        response.headers.add('Access-Control-Allow-Origin', origin)
    response.headers.add('Access-Control-Allow-Headers', '*')
    response.headers.add('Access-Control-Allow-Methods', '*')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    response.headers.add('Access-Control-Max-Age', '86400')
    return response

# ------------------- M-Pesa Routes -------------------
@app.route("/api/mpesa/stkpush", methods=['POST', 'OPTIONS'])
def stk_push():
    print(f"🎯 STK Push request received from origin: {request.headers.get('Origin')}")
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'preflight_ok'})
        origin = request.headers.get('Origin')
        if origin in allowed_origins or any(origin and origin.startswith(allowed.replace(':*', '')) for allowed in allowed_origins if ':*' in allowed):
            response.headers.add('Access-Control-Allow-Origin', origin)
        return response
        
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

# ... rest of your routes remain the same ...