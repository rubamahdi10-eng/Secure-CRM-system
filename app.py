from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    send_from_directory,
    send_file,
)
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from config import Config
from database import db
from auth import auth_service, token_required, role_required
from encryption import encryption_service
from email_service import email_service
from network_utils import get_local_ip, print_network_info, get_client_ip
import logging
import base64
from datetime import datetime
import os
import io

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = Config.SECRET_KEY

# Initialize SocketIO for real-time chat
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Configure CORS to allow requests from any origin (network access)
CORS(
    app,
    resources={
        r"/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "expose_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True,
        }
    },
)

# ==================== AUTHENTICATION ROUTES ====================


@app.route("/")
def index():
    """Landing page"""
    return render_template("login.html")


@app.route("/login", methods=["GET"])
def login_page():
    """Login page"""
    return render_template("login.html")


@app.route("/register", methods=["GET"])
def register_page():
    """Registration page"""
    return render_template("register.html")


@app.route("/forgot-password", methods=["GET"])
def forgot_password_page():
    """Forgot password page"""
    return render_template("forgot-password.html")


@app.route("/reset-password", methods=["GET"])
def reset_password_page():
    """Reset password page"""
    return render_template("reset-password.html")


@app.route("/api/auth/login", methods=["POST"])
def login():
    """User login endpoint"""
    try:
        data = request.json

        if not data:
            logger.error("Login failed: No JSON data received")
            return jsonify({"error": "No data provided"}), 400

        email = data.get("email")
        password = data.get("password")

        client_ip = get_client_ip(request)
        logger.info(f"Login attempt from {client_ip} for email: {email}")

        if not email or not password:
            logger.error("Login failed: Missing email or password")
            return jsonify({"error": "Email and password required"}), 400

        # Get user from database
        user = db.execute_one(
            "SELECT user_id, email, password_hash, role_id, full_name, is_active FROM users WHERE LOWER(email) = LOWER(%s)",
            (email,),
        )

        if not user:
            return jsonify({"error": "Invalid credentials"}), 401

        if not user["is_active"]:
            return jsonify({"error": "Account is inactive"}), 401

        # Verify password
        if not auth_service.verify_password(password, user["password_hash"]):
            # Get role name for audit
            role = db.execute_one(
                "SELECT role_name FROM roles WHERE role_id = %s", (user["role_id"],)
            )
            role_name = role["role_name"] if role else "Unknown"

            # Log failed login attempt
            db.execute_query(
                """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, metadata, details)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (
                    user["user_id"],
                    "Failed Login",
                    "users",
                    user["user_id"],
                    get_client_ip(request),
                    '{"reason": "Invalid password"}',
                    f"Target: {role_name} (ID: N/A, Name: {user['full_name']})",
                ),
                fetch=False,
            )
            return jsonify({"error": "Invalid credentials"}), 401

        # Generate JWT token
        token = auth_service.generate_token(user["user_id"], user["role_id"])

        # Update last login
        db.execute_query(
            "UPDATE users SET last_login = NOW() WHERE user_id = %s",
            (user["user_id"],),
            fetch=False,
        )

        # Get role name
        role = db.execute_one(
            "SELECT role_name FROM roles WHERE role_id = %s", (user["role_id"],)
        )
        role_name = role["role_name"] if role else "Unknown"

        # Log successful login
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                user["user_id"],
                "Login",
                "users",
                user["user_id"],
                get_client_ip(request),
                f"Target: {role_name} (ID: {user['user_id']}, Name: {user['full_name']})",
            ),
            fetch=False,
        )

        return (
            jsonify(
                {
                    "token": token,
                    "user": {
                        "user_id": user["user_id"],
                        "email": user["email"],
                        "full_name": user["full_name"],
                        "role_id": user["role_id"],
                        "role_name": role["role_name"] if role else "Unknown",
                    },
                }
            ),
            200,
        )

    except Exception as e:
        client_ip = get_client_ip(request)
        logger.error(f"Login error from {client_ip}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Login failed: {str(e)}"}), 500


@app.route("/api/auth/register", methods=["POST"])
def register():
    """User registration endpoint"""
    try:
        data = request.json
        full_name = data.get("full_name")
        email = data.get("email")
        password = data.get("password")

        if not all([full_name, email, password]):
            return jsonify({"error": "All fields required"}), 400

        # Check if email already exists
        existing = db.execute_one(
            "SELECT user_id FROM users WHERE LOWER(email) = LOWER(%s)", (email,)
        )
        if existing:
            return jsonify({"error": "Email already registered"}), 400

        # Hash password
        password_hash = auth_service.hash_password(password)

        # Get Student role ID (default for self-registration)
        role = db.execute_one(
            "SELECT role_id FROM roles WHERE role_name = %s", ("Student",)
        )
        if not role:
            return jsonify({"error": "Student role not found"}), 500

        # Insert user
        user = db.execute_one(
            """INSERT INTO users (full_name, email, password_hash, role_id, is_active, email_verified)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING user_id, full_name, email, role_id""",
            (full_name, email, password_hash, role["role_id"], True, False),
        )

        # Log registration
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                user["user_id"],
                "Register",
                "users",
                user["user_id"],
                get_client_ip(request),
                f"Target: Student (ID: {user['user_id']}, Name: {user['full_name']})",
            ),
            fetch=False,
        )

        # Send welcome email
        email_service.send_welcome_email(email, full_name, "Student")

        return (
            jsonify(
                {
                    "message": "Registration successful",
                    "user": {
                        "user_id": user["user_id"],
                        "full_name": user["full_name"],
                        "email": user["email"],
                    },
                }
            ),
            201,
        )

    except Exception as e:
        logger.error(f"Registration error: {e}")
        return jsonify({"error": "Registration failed"}), 500


@app.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    """Send password reset email"""
    try:
        data = request.json
        email = data.get("email")

        logger.info(f"🔍 [FORGOT-PASSWORD] Received request for email: {email}")

        if not email:
            logger.warning(f"🔍 [FORGOT-PASSWORD] No email provided")
            return jsonify({"error": "Email required"}), 400

        # Check if user exists
        logger.info(f"🔍 [FORGOT-PASSWORD] Querying database for user: {email}")
        user = db.execute_one(
            "SELECT user_id, full_name, email, role_id FROM users WHERE LOWER(email) = LOWER(%s)",
            (email,),
        )

        if user:
            logger.info(
                f"🔍 [FORGOT-PASSWORD] User found: {user['full_name']} (ID: {user['user_id']})"
            )

            # Generate reset token (JWT with short expiration)
            reset_token = auth_service.generate_token(
                user["user_id"], 0
            )  # role_id 0 for reset
            logger.info(f"🔍 [FORGOT-PASSWORD] Reset token generated")

            # Send reset email
            reset_link = (
                f"https://{Config.DOMAIN_NAME}/reset-password?token={reset_token}"
            )
            logger.info(
                f"🔍 [FORGOT-PASSWORD] Reset link created: {reset_link[:60]}..."
            )

            subject = "Password Reset Request - YourUni"
            body_html = f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2 style="color: #2c3e50;">Password Reset Request</h2>
                    <p>Dear {user['full_name']},</p>
                    <p>We received a request to reset your password. Click the link below to create a new password:</p>
                    <p style="margin: 20px 0;">
                        <a href="{reset_link}" 
                           style="background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Reset Password
                        </a>
                    </p>
                    <p>Or copy and paste this link in your browser:</p>
                    <p style="color: #7f8c8d; word-break: break-all;">{reset_link}</p>
                    <p style="color: #e74c3c; margin-top: 20px;">
                        <strong>This link will expire in 24 hours.</strong>
                    </p>
                    <p>If you didn't request this, please ignore this email.</p>
                    <br>
                    <p>Best regards,<br>The YourUni Team</p>
                </body>
            </html>
            """
            body_text = f"Reset your password: {reset_link}"

            logger.info(f"🔍 [FORGOT-PASSWORD] About to send email to {email}")
            try:
                email_result = email_service.send_email(
                    email, subject, body_html, body_text
                )
                logger.info(f"🔍 [FORGOT-PASSWORD] Email send result: {email_result}")
            except Exception as email_error:
                logger.error(
                    f"🔍 [FORGOT-PASSWORD] ❌ Email service error: {str(email_error)}",
                    exc_info=True,
                )

            # Get role name for audit
            try:
                role = db.execute_one(
                    "SELECT role_name FROM roles WHERE role_id = %s", (user["role_id"],)
                )
                role_name = role["role_name"] if role else "Unknown"
            except Exception as role_error:
                logger.error(
                    f"🔍 [FORGOT-PASSWORD] Role lookup error: {str(role_error)}"
                )
                role_name = "Unknown"

            # Log action
            try:
                db.execute_query(
                    """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (
                        user["user_id"],
                        "Password Reset Request",
                        "users",
                        user["user_id"],
                        get_client_ip(request),
                        f"Target: {role_name} (ID: {user['user_id']}, Name: {user['full_name']})",
                    ),
                    fetch=False,
                )
                logger.info(f"🔍 [FORGOT-PASSWORD] Audit log created")
            except Exception as audit_error:
                logger.error(
                    f"🔍 [FORGOT-PASSWORD] Audit log error: {str(audit_error)}"
                )
        else:
            logger.warning(f"🔍 [FORGOT-PASSWORD] User not found: {email}")

        # Always return success to prevent email enumeration
        logger.info(f"🔍 [FORGOT-PASSWORD] Returning success response")
        return (
            jsonify(
                {"message": "If the email exists, reset instructions have been sent"}
            ),
            200,
        )

    except Exception as e:
        logger.error(
            f"❌ [FORGOT-PASSWORD] Forgot password error: {str(e)}", exc_info=True
        )
        return jsonify({"error": "Request failed"}), 500


@app.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    """Reset password with token"""
    try:
        data = request.json
        token = data.get("token")
        new_password = data.get("password")

        if not token or not new_password:
            return jsonify({"error": "Token and password required"}), 400

        # Verify token
        payload = auth_service.verify_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401

        user_id = payload.get("user_id")

        # Hash new password
        password_hash = auth_service.hash_password(new_password)

        # Update password
        db.execute_query(
            "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE user_id = %s",
            (password_hash, user_id),
            fetch=False,
        )

        # Get user info for audit and email
        user = db.execute_one(
            "SELECT full_name, email, role_id FROM users WHERE user_id = %s", (user_id,)
        )

        if user:
            # Get role name for audit
            role = db.execute_one(
                "SELECT role_name FROM roles WHERE role_id = %s", (user["role_id"],)
            )
            role_name = role["role_name"] if role else "Unknown"

            # Log action
            db.execute_query(
                """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (
                    user_id,
                    "Password Reset",
                    "users",
                    user_id,
                    get_client_ip(request),
                    f"Target: {role_name} (ID: {user_id}, Name: {user['full_name']})",
                ),
                fetch=False,
            )

        # Get user info for email
        user = db.execute_one(
            "SELECT full_name, email FROM users WHERE user_id = %s", (user_id,)
        )

        if user:
            # Send confirmation email
            subject = "Password Changed - YourUni"
            body_html = f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2 style="color: #2c3e50;">Password Changed Successfully</h2>
                    <p>Dear {user['full_name']},</p>
                    <p>Your password has been successfully changed.</p>
                    <p>If you did not make this change, please contact us immediately.</p>
                    <br>
                    <p>Best regards,<br>The YourUni Team</p>
                </body>
            </html>
            """
            body_text = "Your password has been successfully changed."
            email_service.send_email(user["email"], subject, body_html, body_text)

        return jsonify({"message": "Password reset successful"}), 200

    except Exception as e:
        logger.error(f"Reset password error: {e}")
        return jsonify({"error": "Password reset failed"}), 500


# ==================== DASHBOARD ROUTES ====================


@app.route("/dashboard")
@app.route("/dashboard/<role>")
def dashboard(role=None):
    """Dashboard page - serves appropriate dashboard based on role"""
    return render_template("dashboard.html")


@app.route("/chat")
def chat():
    """Real-time chat page"""
    return render_template("chat.html")


# ==================== USER ROUTES ====================


@app.route("/api/users/me", methods=["GET"])
@token_required
def get_current_user():
    """Get current user information"""
    try:
        user = db.execute_one(
            """SELECT u.user_id, u.full_name, u.email, u.role_id, u.is_active, 
                      u.email_verified, u.created_at, r.role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (request.user_id,),
        )

        if not user:
            return jsonify({"error": "User not found"}), 404

        return jsonify({"user": dict(user)}), 200

    except Exception as e:
        logger.error(f"Get user error: {e}")
        return jsonify({"error": "Failed to get user"}), 500


@app.route("/api/users", methods=["GET"])
@token_required
@role_required(1, 2)  # Manager, Admin
def get_all_users():
    """Get all users - Manager sees all, Admin sees all except Managers. Supports filtering by role."""
    try:
        # Get optional role filter from query params
        role_filter = request.args.get(
            "role"
        )  # e.g., ?role=Counsellor or ?role=Logistics

        if (
            request.role_id == 1
        ):  # SuperAdmin - can see all users including other SuperAdmins
            if role_filter:
                users = db.execute_query(
                    """SELECT u.user_id, u.full_name, u.email, u.is_active, u.email_verified,
                              u.created_at, r.role_name, r.role_id
                       FROM users u
                       JOIN roles r ON u.role_id = r.role_id
                       WHERE r.role_name = %s
                       ORDER BY u.created_at DESC""",
                    (role_filter,),
                )
            else:
                users = db.execute_query(
                    """SELECT u.user_id, u.full_name, u.email, u.is_active, u.email_verified,
                              u.created_at, r.role_name, r.role_id
                       FROM users u
                       JOIN roles r ON u.role_id = r.role_id
                       ORDER BY u.created_at DESC"""
                )
        else:  # Admin (role_id = 2) - can see all users EXCEPT SuperAdmins
            if role_filter:
                users = db.execute_query(
                    """SELECT u.user_id, u.full_name, u.email, u.is_active, u.email_verified,
                              u.created_at, r.role_name, r.role_id
                       FROM users u
                       JOIN roles r ON u.role_id = r.role_id
                       WHERE u.role_id != 1 AND r.role_name = %s
                       ORDER BY u.created_at DESC""",
                    (role_filter,),
                )
            else:
                users = db.execute_query(
                    """SELECT u.user_id, u.full_name, u.email, u.is_active, u.email_verified,
                              u.created_at, r.role_name, r.role_id
                       FROM users u
                       JOIN roles r ON u.role_id = r.role_id
                       WHERE u.role_id != 1
                       ORDER BY u.created_at DESC"""
                )

        return (
            jsonify(
                {
                    "users": [dict(u) for u in users],
                    "current_user": {
                        "user_id": request.user_id,
                        "role_id": request.role_id,
                    },
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Get users error: {e}")
        return jsonify({"error": "Failed to get users"}), 500


@app.route("/api/users", methods=["POST"])
@token_required
@role_required(1, 2)  # Manager, Admin
def create_user():
    """Create new user (Admin only)"""
    try:
        data = request.json
        full_name = data.get("full_name")
        email = data.get("email")
        password = data.get("password")
        role_id = data.get("role_id")
        university_id = data.get("university_id")  # For University Staff

        if not all([full_name, email, password, role_id]):
            return jsonify({"error": "All fields required"}), 400

        # Convert role_id to int for comparison
        try:
            role_id = int(role_id)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid role ID"}), 400

        # Validate university_id for University Staff (role_id = 4)
        if role_id == 4:
            if not university_id or university_id == "":
                return (
                    jsonify(
                        {
                            "error": "University selection is required for University Staff"
                        }
                    ),
                    400,
                )
            try:
                university_id = int(university_id)
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid university ID"}), 400
        else:
            # Ensure university_id is None for non-university staff
            university_id = None

        # Get current user info for audit
        current_user = db.execute_one(
            """SELECT u.user_id, u.full_name, r.role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (request.user_id,),
        )

        # Check if email exists
        existing = db.execute_one(
            "SELECT user_id FROM users WHERE email = %s", (email,)
        )
        if existing:
            return jsonify({"error": "Email already exists"}), 400

        # Hash password
        password_hash = auth_service.hash_password(password)

        # Insert user
        user = db.execute_one(
            """INSERT INTO users (full_name, email, password_hash, role_id, is_active)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING user_id, full_name, email, role_id""",
            (full_name, email, password_hash, role_id, True),
        )

        # If University Staff, link to university by updating portal_user_id
        if role_id == 4 and university_id is not None:
            # First, clear any existing portal_user_id for this university (in case it was assigned to someone else)
            db.execute_query(
                """UPDATE universities 
                   SET portal_user_id = NULL 
                   WHERE university_id = %s AND portal_user_id IS NOT NULL""",
                (university_id,),
                fetch=False,
            )
            # Now assign the new user to this university
            db.execute_query(
                """UPDATE universities 
                   SET portal_user_id = %s 
                   WHERE university_id = %s""",
                (user["user_id"], university_id),
                fetch=False,
            )

        # Get role name and university name if applicable
        role = db.execute_one(
            "SELECT role_name FROM roles WHERE role_id = %s", (role_id,)
        )
        university_name = ""
        if university_id is not None:
            uni = db.execute_one(
                "SELECT name FROM universities WHERE university_id = %s",
                (university_id,),
            )
            university_name = f', University: {uni["name"]}' if uni else ""

        # Comprehensive audit logging with details
        audit_details = f'New User ID: {user["user_id"]}, User Name: {full_name}, Email: {email}, Role: {role["role_name"] if role else "Unknown"}{university_name}, Created by: {current_user["full_name"]} ({current_user["role_name"]}), Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Create User",
                "users",
                user["user_id"],
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Send welcome email
        email_service.send_welcome_email(
            email, full_name, role["role_name"] if role else "User"
        )

        return jsonify({"message": "User created", "user": dict(user)}), 201

    except Exception as e:
        logger.error(f"Create user error: {e}")
        return jsonify({"error": "Failed to create user"}), 500


@app.route("/api/users/<int:user_id>/toggle-status", methods=["PUT"])
@token_required
@role_required(1, 2)  # Manager, Admin
def toggle_user_status(user_id):
    """Activate or deactivate a user account"""
    try:
        # Get current user info for audit
        current_user = db.execute_one(
            """SELECT u.user_id, u.full_name, r.role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (request.user_id,),
        )

        # Get target user status and details
        user = db.execute_one(
            """SELECT u.user_id, u.full_name, u.email, u.is_active, u.role_id, r.role_name as user_role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (user_id,),
        )

        if not user:
            return jsonify({"error": "User not found"}), 404

        # Admins cannot deactivate SuperAdmins
        if request.role_id == 2 and user["role_id"] == 1:
            return jsonify({"error": "Admins cannot modify SuperAdmin accounts"}), 403

        # Prevent self-deactivation
        if user_id == request.user_id:
            return jsonify({"error": "Cannot deactivate your own account"}), 400

        # Toggle status
        new_status = not user["is_active"]

        db.execute_query(
            "UPDATE users SET is_active = %s WHERE user_id = %s",
            (new_status, user_id),
            fetch=False,
        )

        # Comprehensive audit logging with details
        action = "Activate User" if new_status else "Deactivate User"
        audit_details = f'Target User ID: {user_id}, User Name: {user["full_name"]}, Email: {user["email"]}, Role: {user["user_role_name"]}, New Status: {"Active" if new_status else "Inactive"}, Changed by: {current_user["full_name"]} ({current_user["role_name"]}), Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                action,
                "users",
                user_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Notify the user whose account was modified
        notification_msg = f'Your account has been {"activated" if new_status else "deactivated"} by {current_user["full_name"]}.'
        db.execute_query(
            """INSERT INTO notifications (user_id, title, message, triggered_by)
               VALUES (%s, %s, %s, %s)""",
            (
                user_id,
                f'Account {"Activated" if new_status else "Deactivated"}',
                notification_msg,
                request.user_id,
            ),
            fetch=False,
        )

        status_text = "activated" if new_status else "deactivated"
        return (
            jsonify(
                {"message": f"User {status_text} successfully", "is_active": new_status}
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Toggle user status error: {e}")
        return jsonify({"error": "Failed to toggle user status"}), 500


@app.route("/api/users/<int:user_id>", methods=["PUT"])
@token_required
@role_required(1, 2)  # SuperAdmin and Admin only
def update_user(user_id):
    """Update user information"""
    try:
        data = request.json
        full_name = data.get("full_name")
        email = data.get("email")
        role_id = data.get("role_id")
        university_id = data.get("university_id")

        # Get current user details
        user = db.execute_one(
            "SELECT user_id, email, role_id FROM users WHERE user_id = %s", (user_id,)
        )

        if not user:
            return jsonify({"error": "User not found"}), 404

        # Check if email is being changed and if new email already exists
        if email and email != user["email"]:
            existing = db.execute_one(
                "SELECT user_id FROM users WHERE email = %s AND user_id != %s",
                (email, user_id),
            )
            if existing:
                return jsonify({"error": "Email already exists"}), 400

        # Build update query dynamically
        update_fields = []
        params = []

        if full_name:
            update_fields.append("full_name = %s")
            params.append(full_name)

        if email:
            update_fields.append("email = %s")
            params.append(email)

        if role_id:
            role_id = int(role_id)
            update_fields.append("role_id = %s")
            params.append(role_id)

        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400

        params.append(user_id)

        # Update user
        db.execute_query(
            f"UPDATE users SET {', '.join(update_fields)} WHERE user_id = %s",
            tuple(params),
            fetch=False,
        )

        # Handle university assignment for University Staff
        if role_id == 4 and university_id:
            university_id_int = int(university_id)
            # Clear previous university assignments for this user
            db.execute_query(
                "UPDATE universities SET portal_user_id = NULL WHERE portal_user_id = %s",
                (user_id,),
                fetch=False,
            )
            # Clear any existing portal_user_id for this university (in case it was assigned to someone else)
            db.execute_query(
                """UPDATE universities 
                   SET portal_user_id = NULL 
                   WHERE university_id = %s AND portal_user_id IS NOT NULL AND portal_user_id != %s""",
                (university_id_int, user_id),
                fetch=False,
            )
            # Assign new university
            db.execute_query(
                "UPDATE universities SET portal_user_id = %s WHERE university_id = %s",
                (user_id, university_id_int),
                fetch=False,
            )
        elif role_id and role_id != 4:
            # If changing from University Staff to another role, clear university assignment
            db.execute_query(
                "UPDATE universities SET portal_user_id = NULL WHERE portal_user_id = %s",
                (user_id,),
                fetch=False,
            )

        # Audit logging
        audit_details = f'Updated User - ID: {user_id}, Name: {full_name or "unchanged"}, Email: {email or "unchanged"}, Role ID: {role_id or "unchanged"}'
        if role_id == 4 and university_id:
            uni = db.execute_one(
                "SELECT name FROM universities WHERE university_id = %s",
                (university_id,),
            )
            audit_details += f', University: {uni["name"] if uni else "N/A"}'

        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Update User",
                "users",
                user_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return jsonify({"message": "User updated successfully"}), 200

    except Exception as e:
        logger.error(f"Update user error: {e}")
        return jsonify({"error": "Failed to update user"}), 500


@app.route("/api/users/<int:user_id>/delete", methods=["DELETE"])
@token_required
@role_required(1)  # SuperAdmin only
def delete_user(user_id):
    """Delete user account (SuperAdmin only)"""
    try:
        # Get current user info for audit
        current_user = db.execute_one(
            """SELECT u.user_id, u.full_name, r.role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (request.user_id,),
        )

        # Prevent SuperAdmin from deleting themselves
        if user_id == request.user_id:
            return jsonify({"error": "You cannot delete your own account"}), 400

        # Get user details before deletion for audit
        user = db.execute_one(
            """SELECT u.user_id, u.full_name, u.email, r.role_name as user_role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (user_id,),
        )

        if not user:
            return jsonify({"error": "User not found"}), 404

        # Check if user is a Manager (prevent deleting other Managers)
        if user["user_role_name"] == "Manager":
            return jsonify({"error": "Cannot delete Manager accounts"}), 403

        # Comprehensive audit logging BEFORE deletion
        audit_details = f'DELETED User - ID: {user_id}, Name: {user["full_name"]}, Email: {user["email"]}, Role: {user["user_role_name"]}, Deleted by: {current_user["full_name"]} ({current_user["role_name"]}), Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Delete User",
                "users",
                user_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Delete user using the cleanup function to handle all dependencies
        db.execute_query("SELECT delete_user_with_cleanup(%s)", (user_id,), fetch=False)

        return (
            jsonify({"message": f'User {user["full_name"]} deleted successfully'}),
            200,
        )

    except Exception as e:
        logger.error(f"Delete user error: {e}")
        return jsonify({"error": "Failed to delete user"}), 500


# ==================== STUDENT ROUTES ====================


@app.route("/api/students/me", methods=["GET"])
@token_required
@role_required(6)  # Student only
def get_my_student_profile():
    """Get current student's profile"""
    try:
        student = db.execute_one(
            """SELECT s.*, u.full_name, u.email,
                      c.full_name as counsellor_name
               FROM students s
               JOIN users u ON s.user_id = u.user_id
               LEFT JOIN users c ON s.assigned_counsellor_id = c.user_id
               WHERE s.user_id = %s""",
            (request.user_id,),
        )

        if not student:
            return jsonify({"student": None}), 200

        return jsonify({"student": dict(student)}), 200

    except Exception as e:
        logger.error(f"Get student profile error: {e}")
        return jsonify({"error": "Failed to get profile"}), 500


@app.route("/api/students/me", methods=["POST", "PUT"])
@token_required
@role_required(6)  # Student only
def create_or_update_student_profile():
    """Create or update student profile"""
    try:
        data = request.json

        # Check if profile exists
        existing = db.execute_one(
            "SELECT student_id FROM students WHERE user_id = %s", (request.user_id,)
        )

        if existing:
            # Update
            db.execute_query(
                """UPDATE students 
                   SET dob = %s, nationality = %s, phone = %s, 
                       program_interest = %s, preferred_country = %s,
                       education_level = %s, notes = %s, updated_at = NOW()
                   WHERE user_id = %s""",
                (
                    data.get("dob"),
                    data.get("nationality"),
                    data.get("phone"),
                    data.get("program_interest"),
                    data.get("preferred_country"),
                    data.get("education_level"),
                    data.get("notes"),
                    request.user_id,
                ),
                fetch=False,
            )
            message = "Profile updated"
        else:
            # Create
            db.execute_query(
                """INSERT INTO students (user_id, dob, nationality, phone, program_interest, 
                                        preferred_country, education_level, notes)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    request.user_id,
                    data.get("dob"),
                    data.get("nationality"),
                    data.get("phone"),
                    data.get("program_interest"),
                    data.get("preferred_country"),
                    data.get("education_level"),
                    data.get("notes"),
                ),
                fetch=False,
            )
            message = "Profile created"

        return jsonify({"message": message}), 200

    except Exception as e:
        logger.error(f"Student profile error: {e}")
        return jsonify({"error": "Failed to save profile"}), 500


@app.route("/api/students/me/logistics", methods=["GET"])
@token_required
@role_required(6)  # Student only
def get_my_logistics():
    """Get current student's logistics information"""
    try:
        # Get student_id from user_id
        student = db.execute_one(
            "SELECT student_id FROM students WHERE user_id = %s", (request.user_id,)
        )

        if not student:
            return jsonify({"logistics": None}), 200

        # Get logistics record for this student
        logistics = db.execute_one(
            """SELECT l.*, 
                      u_counsellor.full_name as counsellor_name,
                      u_logistics.full_name as logistics_staff_name
               FROM logistics l
               JOIN students s ON l.student_id = s.student_id
               LEFT JOIN users u_counsellor ON s.assigned_counsellor_id = u_counsellor.user_id
               LEFT JOIN users u_logistics ON s.assigned_logistics_id = u_logistics.user_id
               WHERE l.student_id = %s
               ORDER BY l.logistics_id DESC
               LIMIT 1""",
            (student["student_id"],),
        )

        if not logistics:
            return jsonify({"logistics": None}), 200

        # Convert time and date objects to strings
        logistics_dict = dict(logistics)
        if logistics_dict.get("pickup_time"):
            logistics_dict["pickup_time"] = logistics_dict["pickup_time"].strftime(
                "%H:%M"
            )
        if logistics_dict.get("arrival_date"):
            logistics_dict["arrival_date"] = logistics_dict["arrival_date"].strftime(
                "%Y-%m-%d"
            )
        if logistics_dict.get("pickup_date"):
            logistics_dict["pickup_date"] = logistics_dict["pickup_date"].strftime(
                "%Y-%m-%d"
            )
        if logistics_dict.get("medical_check_date"):
            logistics_dict["medical_check_date"] = logistics_dict[
                "medical_check_date"
            ].strftime("%Y-%m-%d")

        return jsonify({"logistics": logistics_dict}), 200

    except Exception as e:
        logger.error(f"Get student logistics error: {e}")
        return jsonify({"error": "Failed to get logistics"}), 500


@app.route("/api/students", methods=["GET"])
@token_required
@role_required(1, 2, 3)  # Manager, Admin, Counsellor
def get_all_students():
    """Get all students (for counsellors/admins)"""
    try:
        # If counsellor, only show assigned students
        if request.role_id == 3:
            students = db.execute_query(
                """SELECT s.*, u.full_name, u.email, u.created_at as user_created_at
                   FROM students s
                   JOIN users u ON s.user_id = u.user_id
                   WHERE s.assigned_counsellor_id = %s
                   ORDER BY s.created_at DESC""",
                (request.user_id,),
            )
        else:
            students = db.execute_query(
                """SELECT s.*, u.full_name, u.email, u.created_at as user_created_at,
                          c.full_name as counsellor_name,
                          l.full_name as logistics_name
                   FROM students s
                   JOIN users u ON s.user_id = u.user_id
                   LEFT JOIN users c ON s.assigned_counsellor_id = c.user_id
                   LEFT JOIN users l ON s.assigned_logistics_id = l.user_id
                   ORDER BY s.created_at DESC"""
            )

        return jsonify({"students": [dict(s) for s in students]}), 200

    except Exception as e:
        logger.error(f"Get students error: {e}")
        return jsonify({"error": "Failed to get students"}), 500


@app.route("/api/students/<int:student_id>/assign", methods=["PUT"])
@token_required
@role_required(1, 2)  # Manager, Admin
def assign_counsellor(student_id):
    """Assign counsellor to student"""
    try:
        data = request.json
        counsellor_id = data.get("counsellor_id")

        if not counsellor_id:
            return jsonify({"error": "Counsellor ID required"}), 400

        # Get student and counsellor info
        student_info = db.execute_one(
            """SELECT s.student_id, u.full_name as student_name
               FROM students s
               JOIN users u ON s.user_id = u.user_id
               WHERE s.student_id = %s""",
            (student_id,),
        )

        counsellor_info = db.execute_one(
            """SELECT u.user_id, u.full_name as counsellor_name
               FROM users u
               WHERE u.user_id = %s AND u.role_id = 3""",
            (counsellor_id,),
        )

        # Update student
        db.execute_query(
            """UPDATE students 
               SET assigned_counsellor_id = %s, 
                   application_status = 'Assigned to Counsellor',
                   updated_at = NOW()
               WHERE student_id = %s""",
            (counsellor_id, student_id),
            fetch=False,
        )

        # Log action with details
        audit_details = f'Student ID: {student_id}, Student Name: {student_info["student_name"] if student_info else "N/A"}, Counsellor ID: {counsellor_id}, Counsellor Name: {counsellor_info["counsellor_name"] if counsellor_info else "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Assign Counsellor",
                "students",
                student_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Create notification for student
        student = db.execute_one(
            "SELECT user_id FROM students WHERE student_id = %s", (student_id,)
        )
        if student:
            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    student["user_id"],
                    "Counsellor Assigned",
                    "A counsellor has been assigned to your application.",
                    request.user_id,
                ),
                fetch=False,
            )

        return jsonify({"message": "Counsellor assigned successfully"}), 200

    except Exception as e:
        logger.error(f"Assign counsellor error: {e}")
        return jsonify({"error": "Failed to assign counsellor"}), 500


def unassign_counsellor(student_id):
    """Helper function to unassign counsellor from student"""
    try:
        # Get current user info for audit
        current_user = db.execute_one(
            """SELECT u.user_id, u.full_name, r.role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (request.user_id,),
        )

        # Get student info and previous counsellor assignment
        student_info = db.execute_one(
            """SELECT s.student_id, s.user_id, s.assigned_counsellor_id, u.full_name as student_name,
                      prev_couns.full_name as previous_counsellor_name
               FROM students s
               JOIN users u ON s.user_id = u.user_id
               LEFT JOIN users prev_couns ON s.assigned_counsellor_id = prev_couns.user_id
               WHERE s.student_id = %s""",
            (student_id,),
        )

        if not student_info:
            return jsonify({"error": "Student not found"}), 404

        # Update student - unassign counsellor and set status back to Incomplete Profile
        db.execute_query(
            """UPDATE students 
               SET assigned_counsellor_id = NULL, 
                   application_status = 'Incomplete Profile',
                   updated_at = NOW()
               WHERE student_id = %s""",
            (student_id,),
            fetch=False,
        )

        # Audit logging
        audit_details = f'Student ID: {student_id}, Student Name: {student_info["student_name"]}, Unassigned by: {current_user["full_name"]} ({current_user["role_name"]}), Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
        if student_info["assigned_counsellor_id"]:
            audit_details += f', Previous Counsellor ID: {student_info["assigned_counsellor_id"]}, Previous Counsellor Name: {student_info["previous_counsellor_name"]}'

        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Unassign Counsellor",
                "students",
                student_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Notify the student
        if student_info["user_id"]:
            notification_msg = (
                f'Your counsellor has been unassigned by {current_user["full_name"]}.'
            )
            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    student_info["user_id"],
                    "Counsellor Unassigned",
                    notification_msg,
                    request.user_id,
                ),
                fetch=False,
            )

        return jsonify({"message": "Counsellor unassigned successfully"}), 200

    except Exception as e:
        logger.error(f"Unassign counsellor error: {e}")
        return jsonify({"error": "Failed to unassign counsellor"}), 500


def unassign_logistics(student_id):
    """Helper function to unassign logistics staff from student"""
    try:
        # Get current user info for audit
        current_user = db.execute_one(
            """SELECT u.user_id, u.full_name, r.role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (request.user_id,),
        )

        # Get student info and previous logistics assignment
        student_info = db.execute_one(
            """SELECT s.student_id, s.user_id, s.assigned_logistics_id, u.full_name as student_name,
                      prev_log.full_name as previous_logistics_name
               FROM students s
               JOIN users u ON s.user_id = u.user_id
               LEFT JOIN users prev_log ON s.assigned_logistics_id = prev_log.user_id
               WHERE s.student_id = %s""",
            (student_id,),
        )

        if not student_info:
            return jsonify({"error": "Student not found"}), 404

        # Update student - unassign logistics
        db.execute_query(
            """UPDATE students 
               SET assigned_logistics_id = NULL,
                   updated_at = NOW()
               WHERE student_id = %s""",
            (student_id,),
            fetch=False,
        )

        # Audit logging
        audit_details = f'Student ID: {student_id}, Student Name: {student_info["student_name"]}, Unassigned by: {current_user["full_name"]} ({current_user["role_name"]}), Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
        if student_info["assigned_logistics_id"]:
            audit_details += f', Previous Logistics ID: {student_info["assigned_logistics_id"]}, Previous Logistics Name: {student_info["previous_logistics_name"]}'

        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Unassign Logistics",
                "students",
                student_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Notify the student
        if student_info["user_id"]:
            notification_msg = f'Your logistics staff has been unassigned by {current_user["full_name"]}.'
            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    student_info["user_id"],
                    "Logistics Unassigned",
                    notification_msg,
                    request.user_id,
                ),
                fetch=False,
            )

        return jsonify({"message": "Logistics staff unassigned successfully"}), 200

    except Exception as e:
        logger.error(f"Unassign logistics error: {e}")
        return jsonify({"error": "Failed to unassign logistics staff"}), 500


@app.route("/api/students/<int:student_id>/assign-counsellor", methods=["PUT"])
@token_required
@role_required(1, 2)  # Manager, Admin
def reassign_counsellor(student_id):
    """Assign or reassign counsellor to student"""
    try:
        data = request.json
        counsellor_id = data.get("counsellor_id")

        # Allow None/null for unassigning
        if counsellor_id is None:
            # Handle unassign case
            return unassign_counsellor(student_id)

        # Get current user info for audit
        current_user = db.execute_one(
            """SELECT u.user_id, u.full_name, r.role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (request.user_id,),
        )

        # Verify counsellor exists and has counsellor role
        counsellor = db.execute_one(
            """SELECT u.user_id, u.full_name 
               FROM users u 
               WHERE u.user_id = %s AND u.role_id = 3""",
            (counsellor_id,),
        )

        if not counsellor:
            return jsonify({"error": "Invalid counsellor"}), 400

        # Get student info and previous counsellor assignment
        student_info = db.execute_one(
            """SELECT s.student_id, s.user_id, s.assigned_counsellor_id, u.full_name as student_name,
                      prev_couns.full_name as previous_counsellor_name
               FROM students s
               JOIN users u ON s.user_id = u.user_id
               LEFT JOIN users prev_couns ON s.assigned_counsellor_id = prev_couns.user_id
               WHERE s.student_id = %s""",
            (student_id,),
        )

        if not student_info:
            return jsonify({"error": "Student not found"}), 404

        # Update student
        db.execute_query(
            """UPDATE students 
               SET assigned_counsellor_id = %s, 
                   application_status = 'Assigned to Counsellor',
                   updated_at = NOW()
               WHERE student_id = %s""",
            (counsellor_id, student_id),
            fetch=False,
        )

        # Comprehensive audit logging with details
        action_type = (
            "Reassign Counsellor"
            if student_info["assigned_counsellor_id"]
            else "Assign Counsellor"
        )
        audit_details = f'Student ID: {student_id}, Student Name: {student_info["student_name"]}, Counsellor ID: {counsellor_id}, Counsellor Name: {counsellor["full_name"]}, Assigned by: {current_user["full_name"]} ({current_user["role_name"]}), Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
        if student_info["assigned_counsellor_id"]:
            audit_details += f', Previous Counsellor ID: {student_info["assigned_counsellor_id"]}, Previous Counsellor Name: {student_info["previous_counsellor_name"]}'

        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                action_type,
                "students",
                student_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Create notification for student
        if student_info["user_id"]:
            notification_msg = f'Counsellor {counsellor["full_name"]} has been assigned to your application by {current_user["full_name"]}.'
            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    student_info["user_id"],
                    "Counsellor Assigned",
                    notification_msg,
                    request.user_id,
                ),
                fetch=False,
            )

        # Notify the counsellor
        counsellor_notification = f'You have been assigned to student {student_info["student_name"]} by {current_user["full_name"]}.'
        db.execute_query(
            """INSERT INTO notifications (user_id, title, message, triggered_by)
               VALUES (%s, %s, %s, %s)""",
            (
                counsellor_id,
                "New Student Assignment",
                counsellor_notification,
                request.user_id,
            ),
            fetch=False,
        )

        return jsonify({"message": "Counsellor assigned successfully"}), 200

    except Exception as e:
        logger.error(f"Reassign counsellor error: {e}")
        return jsonify({"error": "Failed to assign counsellor"}), 500


@app.route("/api/students/<int:student_id>/assign-logistics", methods=["PUT"])
@token_required
@role_required(1, 2)  # Manager, Admin
def reassign_logistics(student_id):
    """Assign or reassign logistics staff to student"""
    try:
        data = request.json
        logistics_id = data.get("logistics_id")

        # Allow None/null for unassigning
        if logistics_id is None:
            # Handle unassign case
            return unassign_logistics(student_id)

        # Get current user info for audit
        current_user = db.execute_one(
            """SELECT u.user_id, u.full_name, r.role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (request.user_id,),
        )

        # Verify logistics staff exists and has logistics role
        logistics = db.execute_one(
            """SELECT u.user_id, u.full_name 
               FROM users u 
               WHERE u.user_id = %s AND u.role_id = 5""",
            (logistics_id,),
        )

        if not logistics:
            return jsonify({"error": "Invalid logistics staff"}), 400

        # Get student info and previous logistics assignment
        student_info = db.execute_one(
            """SELECT s.student_id, s.user_id, s.assigned_logistics_id, u.full_name as student_name,
                      prev_log.full_name as previous_logistics_name
               FROM students s
               JOIN users u ON s.user_id = u.user_id
               LEFT JOIN users prev_log ON s.assigned_logistics_id = prev_log.user_id
               WHERE s.student_id = %s""",
            (student_id,),
        )

        if not student_info:
            return jsonify({"error": "Student not found"}), 404

        # Update student with logistics assignment and update status
        db.execute_query(
            """UPDATE students 
               SET assigned_logistics_id = %s,
                   application_status = 'Assigned to Counsellor and Logistics',
                   updated_at = NOW()
               WHERE student_id = %s""",
            (logistics_id, student_id),
            fetch=False,
        )

        # Comprehensive audit logging with details
        action_type = (
            "Reassign Logistics"
            if student_info["assigned_logistics_id"]
            else "Assign Logistics"
        )
        audit_details = f'Student ID: {student_id}, Student Name: {student_info["student_name"]}, Logistics ID: {logistics_id}, Logistics Name: {logistics["full_name"]}, Assigned by: {current_user["full_name"]} ({current_user["role_name"]}), Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
        if student_info["assigned_logistics_id"]:
            audit_details += f', Previous Logistics ID: {student_info["assigned_logistics_id"]}, Previous Logistics Name: {student_info["previous_logistics_name"]}'

        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                action_type,
                "students",
                student_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Create notification for student
        if student_info["user_id"]:
            notification_msg = f'Logistics staff {logistics["full_name"]} has been assigned to assist with your arrival by {current_user["full_name"]}.'
            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    student_info["user_id"],
                    "Logistics Staff Assigned",
                    notification_msg,
                    request.user_id,
                ),
                fetch=False,
            )

        # Notify the logistics staff member
        logistics_notification = f'You have been assigned to assist student {student_info["student_name"]} by {current_user["full_name"]}.'
        db.execute_query(
            """INSERT INTO notifications (user_id, title, message, triggered_by)
               VALUES (%s, %s, %s, %s)""",
            (
                logistics_id,
                "New Student Assignment",
                logistics_notification,
                request.user_id,
            ),
            fetch=False,
        )

        return jsonify({"message": "Logistics staff assigned successfully"}), 200

    except Exception as e:
        logger.error(f"Assign logistics error: {e}")
        return jsonify({"error": "Failed to assign logistics staff"}), 500


# ==================== APPLICATION ROUTES ====================


@app.route("/api/applications", methods=["GET"])
@token_required
def get_applications():
    """Get applications based on user role"""
    try:
        if request.role_id == 6:  # Student
            # Get student_id first
            student = db.execute_one(
                "SELECT student_id FROM students WHERE user_id = %s", (request.user_id,)
            )
            if not student:
                return jsonify({"applications": []}), 200

            applications = db.execute_query(
                """SELECT a.application_id, a.student_id, a.university_id, a.program_name,
                          a.intake, a.counsellor_id, a.status, a.decision_type, a.decision_notes, a.decision_date,
                          a.created_at, a.submitted_at,
                          u.name as university_name, u.country,
                          c.full_name as counsellor_name,
                          CASE WHEN a.conditional_offer_encrypted_blob IS NOT NULL THEN true ELSE false END as has_conditional_offer
                   FROM applications a
                   JOIN universities u ON a.university_id = u.university_id
                   LEFT JOIN users c ON a.counsellor_id = c.user_id
                   WHERE a.student_id = %s
                   ORDER BY a.created_at DESC""",
                (student["student_id"],),
            )
        elif request.role_id == 3:  # Counsellor
            applications = db.execute_query(
                """SELECT a.application_id, a.student_id, a.university_id, a.program_name,
                          a.intake, a.counsellor_id, a.status, a.decision_type, a.decision_notes, a.decision_date,
                          a.created_at, a.submitted_at,
                          u.name as university_name, u.country,
                          s.student_id, usr.full_name as student_name,
                          CASE WHEN a.conditional_offer_encrypted_blob IS NOT NULL THEN true ELSE false END as has_conditional_offer
                   FROM applications a
                   JOIN universities u ON a.university_id = u.university_id
                   JOIN students s ON a.student_id = s.student_id
                   JOIN users usr ON s.user_id = usr.user_id
                   WHERE a.counsellor_id = %s OR s.assigned_counsellor_id = %s
                   ORDER BY a.created_at DESC""",
                (request.user_id, request.user_id),
            )
        elif request.role_id == 4:  # University Staff
            # Get university_id for this user
            university = db.execute_one(
                "SELECT university_id FROM universities WHERE portal_user_id = %s",
                (request.user_id,),
            )
            if not university:
                return jsonify({"applications": []}), 200

            applications = db.execute_query(
                """SELECT a.application_id, a.student_id, a.university_id, a.program_name,
                          a.intake, a.counsellor_id, a.status, a.decision_type, a.decision_notes, a.decision_date,
                          a.created_at, a.submitted_at,
                          u.name as university_name, u.country,
                          s.student_id, usr.full_name as student_name,
                          c.full_name as counsellor_name,
                          CASE WHEN a.conditional_offer_encrypted_blob IS NOT NULL THEN true ELSE false END as has_conditional_offer
                   FROM applications a
                   JOIN universities u ON a.university_id = u.university_id
                   JOIN students s ON a.student_id = s.student_id
                   JOIN users usr ON s.user_id = usr.user_id
                   LEFT JOIN users c ON s.assigned_counsellor_id = c.user_id
                   WHERE a.university_id = %s
                   ORDER BY a.created_at DESC""",
                (university["university_id"],),
            )
        else:  # Admin/Manager
            applications = db.execute_query(
                """SELECT a.application_id, a.student_id, a.university_id, a.program_name,
                          a.intake, a.counsellor_id, a.status, a.decision_type, a.decision_notes, a.decision_date,
                          a.created_at, a.submitted_at,
                          u.name as university_name, u.country,
                          s.student_id, usr.full_name as student_name,
                          c.full_name as counsellor_name,
                          CASE WHEN a.conditional_offer_encrypted_blob IS NOT NULL THEN true ELSE false END as has_conditional_offer
                   FROM applications a
                   JOIN universities u ON a.university_id = u.university_id
                   JOIN students s ON a.student_id = s.student_id
                   JOIN users usr ON s.user_id = usr.user_id
                   LEFT JOIN users c ON a.counsellor_id = c.user_id
                   ORDER BY a.created_at DESC"""
            )

        return jsonify({"applications": [dict(a) for a in applications]}), 200

    except Exception as e:
        logger.error(f"Get applications error: {e}")
        return jsonify({"error": "Failed to get applications"}), 500


@app.route("/api/applications", methods=["POST"])
@token_required
@role_required(3, 6)  # Counsellor or Student
def create_application():
    """Create new application"""
    try:
        data = request.json

        # Get student_id
        if request.role_id == 6:  # Student
            student = db.execute_one(
                "SELECT student_id, assigned_counsellor_id FROM students WHERE user_id = %s",
                (request.user_id,),
            )
            if not student:
                return jsonify({"error": "Student profile not found"}), 404

            student_id = student["student_id"]
            counsellor_id = student["assigned_counsellor_id"]
        else:  # Counsellor
            student_id = data.get("student_id")
            counsellor_id = request.user_id

        # Handle both intake_id (new) and intake (legacy string format)
        intake_value = None
        if data.get("intake_id"):
            # New format: fetch intake name from intake_id
            intake_record = db.execute_one(
                "SELECT intake_name FROM intakes WHERE intake_id = %s",
                (data.get("intake_id"),),
            )
            if not intake_record:
                return jsonify({"error": "Invalid intake selected"}), 400
            intake_value = intake_record["intake_name"]
        elif data.get("intake"):
            # Legacy format: use intake string directly
            intake_value = data.get("intake")

        if not intake_value:
            return jsonify({"error": "Intake is required"}), 400

        # Create application
        application = db.execute_one(
            """INSERT INTO applications (student_id, counsellor_id, university_id, program_name, intake, submitted_at)
               VALUES (%s, %s, %s, %s, %s, NOW())
               RETURNING application_id, status, created_at""",
            (
                student_id,
                counsellor_id,
                data.get("university_id"),
                data.get("program_name"),
                intake_value,
            ),
        )

        # Get details for audit log
        app_details = db.execute_one(
            """SELECT s.full_name as student_name, u.name as university_name, a.program_name
               FROM applications a
               JOIN students st ON a.student_id = st.student_id
               JOIN users s ON st.user_id = s.user_id
               JOIN universities u ON a.university_id = u.university_id
               WHERE a.application_id = %s""",
            (application["application_id"],),
        )

        # Log action with details
        audit_details = f'Application ID: {application["application_id"]}, Student ID: {student_id}, Student Name: {app_details["student_name"] if app_details else "N/A"}, University: {app_details["university_name"] if app_details else "N/A"}, Program: {app_details["program_name"] if app_details else "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Create Application",
                "applications",
                application["application_id"],
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return (
            jsonify(
                {"message": "Application created", "application": dict(application)}
            ),
            201,
        )

    except Exception as e:
        logger.error(f"Create application error: {e}")
        return jsonify({"error": "Failed to create application"}), 500


@app.route("/api/applications/<int:application_id>/decision", methods=["PUT"])
@token_required
@role_required(1, 2, 4)  # SuperAdmin, Admin, and University Staff
def make_decision(application_id):
    """University makes decision on application"""
    try:
        # Check if this is a multipart form (with file upload) or JSON
        if request.content_type and "multipart/form-data" in request.content_type:
            decision_type = request.form.get("decision_type")
            decision_notes = request.form.get("decision_notes", "")
            offer_letter_file = request.files.get("offer_letter_file")
            logger.info(
                f"Multipart request - Decision: {decision_type}, File present: {offer_letter_file is not None}"
            )
        else:
            data = request.json
            decision_type = data.get("decision_type")
            decision_notes = data.get("decision_notes", "")
            offer_letter_file = None
            logger.info(f"JSON request - Decision: {decision_type}")

        if decision_type not in [
            "Accepted",
            "Rejected",
            "Conditional",
            "Missing Documents",
        ]:
            return jsonify({"error": "Invalid decision type"}), 400

        # Validate offer letter file upload for Accepted and Conditional decisions
        if decision_type in ["Accepted", "Conditional"]:
            if not offer_letter_file:
                decision_label = (
                    "acceptance" if decision_type == "Accepted" else "conditional offer"
                )
                return (
                    jsonify(
                        {
                            "error": f"Offer letter PDF is required for {decision_label} decisions"
                        }
                    ),
                    400,
                )

            # Validate file type
            if not offer_letter_file.filename.lower().endswith(".pdf"):
                return jsonify({"error": "Offer letter must be a PDF file"}), 400

        # Get application details
        application = db.execute_one(
            """SELECT a.application_id, a.university_id, a.status, a.student_id
               FROM applications a
               WHERE a.application_id = %s""",
            (application_id,),
        )

        if not application:
            return jsonify({"error": "Application not found"}), 404

        # Check if application status is "Forwarded to University"
        # University Staff can only make decisions on forwarded applications
        # SuperAdmin and Admin can make decisions on any status
        if request.role_id == 4:  # University Staff
            if application["status"] != "Forwarded to University":
                return (
                    jsonify(
                        {
                            "error": "Can only make decisions on applications that have been forwarded to university"
                        }
                    ),
                    403,
                )

            # Verify they own this application's university
            university = db.execute_one(
                "SELECT university_id FROM universities WHERE portal_user_id = %s",
                (request.user_id,),
            )
            if not university:
                return jsonify({"error": "University not found for this user"}), 404

            # Check if application belongs to this university
            if application["university_id"] != university["university_id"]:
                return (
                    jsonify(
                        {
                            "error": "Access denied. This application is not for your university"
                        }
                    ),
                    403,
                )

            # Check if all required documents are verified for this application
            required_docs = ["Passport", "Transcript", "English Test", "Personal Photo"]

            # Get ALL uploaded documents for this application (including "Other" docs)
            all_uploaded_docs = db.execute_query(
                """SELECT doc_type, verified, uni_verified 
                   FROM documents 
                   WHERE application_id = %s""",
                (application_id,),
            )

            # Create a dict of uploaded document types and their verification status
            doc_status = (
                {
                    doc["doc_type"]: {
                        "verified": doc["verified"],
                        "uni_verified": doc["uni_verified"],
                    }
                    for doc in all_uploaded_docs
                }
                if all_uploaded_docs
                else {}
            )

            # Check for missing required documents
            missing_docs = [doc for doc in required_docs if doc not in doc_status]

            if missing_docs:
                return (
                    jsonify(
                        {
                            "error": "Cannot make decision. Missing required documents",
                            "missing_documents": missing_docs,
                        }
                    ),
                    400,
                )

            # Check for unverified documents by university staff (Stage 2)
            # Only enforce for Accepted and Conditional decisions
            # This includes ALL documents (required + "Other")
            if decision_type in ["Accepted", "Conditional"]:
                unverified_docs = [
                    doc_type
                    for doc_type, status in doc_status.items()
                    if status["uni_verified"] != True
                ]

                if unverified_docs:
                    return (
                        jsonify(
                            {
                                "error": 'Cannot approve application. All documents (including "Other" documents) must be verified by university staff before accepting',
                                "unverified_documents": unverified_docs,
                            }
                        ),
                        400,
                    )

            # For rejected or missing documents decisions, check if any docs are still pending
            # (to ensure uni staff has at least reviewed all documents, including "Other")
            if decision_type in ["Rejected", "Missing Documents"]:
                pending_docs = [
                    doc_type
                    for doc_type, status in doc_status.items()
                    if status["uni_verified"] is None
                ]

                if pending_docs:
                    return (
                        jsonify(
                            {
                                "error": 'Please review all documents (including "Other" documents) before making a decision. Some documents are still pending verification',
                                "pending_documents": pending_docs,
                            }
                        ),
                        400,
                    )

        # If decision is "Missing Documents", set status back to "In Review" so admin can re-forward
        if decision_type == "Missing Documents":
            new_status = "Missing Documents - In Review"
        else:
            new_status = f"Decision: {decision_type}"

        # Handle offer letter file upload if present (for Accepted and Conditional decisions)
        offer_letter_blob = None
        offer_letter_iv = None
        offer_letter_filename = None

        if offer_letter_file:
            try:
                # Read file content
                file_content = offer_letter_file.read()
                logger.info(f"File read successfully, size: {len(file_content)} bytes")

                # Encrypt the file (returns tuple: encrypted_data, iv)
                offer_letter_blob, offer_letter_iv = (
                    encryption_service.encrypt_document(file_content)
                )
                offer_letter_filename = offer_letter_file.filename
                logger.info(f"File encrypted successfully: {offer_letter_filename}")
            except Exception as file_error:
                logger.error(f"File encryption error: {file_error}", exc_info=True)
                return (
                    jsonify(
                        {
                            "error": f"Failed to process offer letter file: {str(file_error)}"
                        }
                    ),
                    500,
                )

        # Add columns for offer letter if they don't exist
        db.execute_query(
            """ALTER TABLE applications 
               ADD COLUMN IF NOT EXISTS conditional_offer_encrypted_blob BYTEA,
               ADD COLUMN IF NOT EXISTS conditional_offer_iv BYTEA,
               ADD COLUMN IF NOT EXISTS conditional_offer_filename VARCHAR(255)""",
            fetch=False,
        )

        # Update application with decision and optional offer letter file
        if offer_letter_blob:
            db.execute_query(
                """UPDATE applications 
                   SET status = %s, decision_type = %s, decision_notes = %s, decision_date = NOW(),
                       conditional_offer_encrypted_blob = %s, conditional_offer_iv = %s, conditional_offer_filename = %s
                   WHERE application_id = %s""",
                (
                    new_status,
                    decision_type,
                    decision_notes,
                    offer_letter_blob,
                    offer_letter_iv,
                    offer_letter_filename,
                    application_id,
                ),
                fetch=False,
            )
        else:
            db.execute_query(
                """UPDATE applications 
                   SET status = %s, decision_type = %s, decision_notes = %s, decision_date = NOW()
                   WHERE application_id = %s""",
                (new_status, decision_type, decision_notes, application_id),
                fetch=False,
            )

        # Get student and counsellor info
        app_info = db.execute_one(
            """SELECT s.user_id, s.assigned_counsellor_id, u.full_name, u.email, uni.name as university_name
               FROM applications a
               JOIN students s ON a.student_id = s.student_id
               JOIN users u ON s.user_id = u.user_id
               JOIN universities uni ON a.university_id = uni.university_id
               WHERE a.application_id = %s""",
            (application_id,),
        )

        if app_info:
            # Notify student with decision notes
            notification_message = f'Your application to {app_info["university_name"]} has been {decision_type.lower()}.'
            if decision_notes:
                notification_message += f"\n\nNotes from university: {decision_notes}"

            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    app_info["user_id"],
                    f"Application {decision_type}",
                    notification_message,
                    request.user_id,
                ),
                fetch=False,
            )

            # Notify counsellor if assigned
            if app_info["assigned_counsellor_id"]:
                counsellor_message = f'Application decision for student {app_info["full_name"]} to {app_info["university_name"]}: {decision_type}.'
                if decision_notes:
                    counsellor_message += f"\n\nUniversity notes: {decision_notes}"

                db.execute_query(
                    """INSERT INTO notifications (user_id, title, message, triggered_by)
                       VALUES (%s, %s, %s, %s)""",
                    (
                        app_info["assigned_counsellor_id"],
                        f"Application Decision - {decision_type}",
                        counsellor_message,
                        request.user_id,
                    ),
                    fetch=False,
                )

            # Send email
            email_service.send_application_notification(
                app_info["email"],
                app_info["full_name"],
                app_info["university_name"],
                decision_type,
            )

        # Log action with details
        audit_details = f'Application ID: {application_id}, Decision: {decision_type}, Student Name: {app_info["full_name"] if app_info else "N/A"}, University: {app_info["university_name"] if app_info else "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                f"Decision: {decision_type}",
                "applications",
                application_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return jsonify({"message": "Decision recorded successfully"}), 200

    except Exception as e:
        logger.error(f"Make decision error: {e}", exc_info=True)
        import traceback

        traceback.print_exc()
        return jsonify({"error": f"Failed to record decision: {str(e)}"}), 500


@app.route("/api/applications/<int:application_id>/conditional-offer", methods=["GET"])
@token_required
def download_conditional_offer(application_id):
    """Download conditional offer letter for an application"""
    try:
        # Get application details including the student, counsellor, university, and file info
        application = db.execute_one(
            """SELECT a.application_id, a.student_id, a.university_id, a.conditional_offer_encrypted_blob, 
                      a.conditional_offer_iv, a.conditional_offer_filename,
                      s.user_id as student_user_id, s.assigned_counsellor_id
               FROM applications a
               JOIN students s ON a.student_id = s.student_id
               WHERE a.application_id = %s""",
            (application_id,),
        )

        if not application:
            return jsonify({"error": "Application not found"}), 404

        # Check if conditional offer file exists
        if not application["conditional_offer_encrypted_blob"]:
            return jsonify({"error": "No offer letter found for this application"}), 404

        # Access control: Student (owner), counsellor (assigned), university staff (their university), and admins can download
        user_role_id = request.role_id
        user_id = request.user_id

        has_access = False

        # SuperAdmin or Admin
        if user_role_id in [1, 2]:
            has_access = True

        # Student (must be the owner of the application)
        elif user_role_id == 6:
            if application["student_user_id"] == user_id:
                has_access = True

        # Counsellor (must be assigned to this student)
        elif user_role_id == 3:
            if application["assigned_counsellor_id"] == user_id:
                has_access = True

        # University Staff (must be from the university this application was sent to)
        elif user_role_id == 4:
            university = db.execute_one(
                "SELECT university_id FROM universities WHERE portal_user_id = %s",
                (user_id,),
            )
            if (
                university
                and university["university_id"] == application["university_id"]
            ):
                has_access = True

        if not has_access:
            return (
                jsonify(
                    {
                        "error": "Access denied. You do not have permission to view this offer letter"
                    }
                ),
                403,
            )

        # Decrypt the file
        decrypted_content = encryption_service.decrypt_document(
            application["conditional_offer_encrypted_blob"],
            application["conditional_offer_iv"],
        )

        # Log the download
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                user_id,
                "Download Conditional Offer",
                "applications",
                application_id,
                get_client_ip(request),
                f'Application ID: {application_id}, Filename: {application["conditional_offer_filename"]}',
            ),
            fetch=False,
        )

        # Return the file
        return send_file(
            io.BytesIO(decrypted_content),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=application["conditional_offer_filename"]
            or "conditional_offer.pdf",
        )

    except Exception as e:
        logger.error(f"Download conditional offer error: {e}")
        return jsonify({"error": "Failed to download conditional offer letter"}), 500


@app.route("/api/applications/<int:application_id>/status", methods=["PUT"])
@token_required
@role_required(1, 2, 3)  # Admin, SuperAdmin, Counsellor
def update_application_status(application_id):
    """Update application status by counsellor/admin"""
    try:
        data = request.json
        status = data.get("status")
        notes = data.get("notes", "")

        if not status:
            return jsonify({"error": "Status is required"}), 400

        db.execute_query(
            """UPDATE applications SET status = %s, updated_at = NOW(), counsellor_notes = %s
               WHERE application_id = %s""",
            (status, notes, application_id),
            fetch=False,
        )

        # Notify student
        app_info = db.execute_one(
            """SELECT s.user_id, u.full_name, u.email, uni.name as university_name
               FROM applications a
               JOIN students s ON a.student_id = s.student_id
               JOIN users u ON s.user_id = u.user_id
               JOIN universities uni ON a.university_id = uni.university_id
               WHERE a.application_id = %s""",
            (application_id,),
        )

        if app_info:
            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    app_info["user_id"],
                    "Application Status Updated",
                    f"Your application status changed to: {status}. Notes: {notes}",
                    request.user_id,
                ),
                fetch=False,
            )

        # Log action with details
        audit_details = f'Application ID: {application_id}, New Status: {status}, Student Name: {app_info["full_name"] if app_info else "N/A"}, University: {app_info["university_name"] if app_info else "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                f"Update Application Status: {status}",
                "applications",
                application_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return jsonify({"message": "Application status updated"}), 200

    except Exception as e:
        logger.error(f"Update application status error: {e}")
        return jsonify({"error": "Failed to update application status"}), 500


@app.route("/api/applications/<int:application_id>/forward", methods=["PUT"])
@token_required
@role_required(1, 2, 3)  # SuperAdmin, Admin, and Counsellor can forward
def forward_application(application_id):
    """Forward application to university staff for review"""
    try:
        # Get current user info for audit
        current_user = db.execute_one(
            """SELECT u.user_id, u.full_name, r.role_name
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.user_id = %s""",
            (request.user_id,),
        )

        # Get application details - SuperAdmin and Admin can forward any application
        # Counsellors can only forward their own applications OR applications from students assigned to them
        if request.role_id in [1, 2]:  # SuperAdmin or Admin
            app = db.execute_one(
                """SELECT a.*, s.user_id as student_user_id, u.full_name as student_name, 
                          uni.name as university_name, uni.portal_user_id,
                          c.full_name as counsellor_name
                   FROM applications a
                   JOIN students s ON a.student_id = s.student_id
                   JOIN users u ON s.user_id = u.user_id
                   JOIN universities uni ON a.university_id = uni.university_id
                   LEFT JOIN users c ON a.counsellor_id = c.user_id
                   WHERE a.application_id = %s""",
                (application_id,),
            )
        else:  # Counsellor - can forward applications they created OR from students assigned to them
            app = db.execute_one(
                """SELECT a.*, s.user_id as student_user_id, u.full_name as student_name, 
                          uni.name as university_name, uni.portal_user_id,
                          c.full_name as counsellor_name
                   FROM applications a
                   JOIN students s ON a.student_id = s.student_id
                   JOIN users u ON s.user_id = u.user_id
                   JOIN universities uni ON a.university_id = uni.university_id
                   LEFT JOIN users c ON a.counsellor_id = c.user_id
                   WHERE a.application_id = %s 
                   AND (a.counsellor_id = %s OR s.assigned_counsellor_id = %s)""",
                (application_id, request.user_id, request.user_id),
            )

        if not app:
            return jsonify({"error": "Application not found or access denied"}), 404

        # Determine if this is a re-forward (for conditional offers with new documents)
        is_reforward = app["status"] in [
            "Decision: Conditional",
            "Missing Documents - In Review",
        ]

        # Check if all required documents are uploaded and verified for this application
        required_docs = ["Passport", "Transcript", "English Test", "Personal Photo"]

        # Get all uploaded documents for this application
        all_uploaded_docs = db.execute_query(
            """SELECT doc_type, verified 
               FROM documents 
               WHERE application_id = %s""",
            (application_id,),
        )

        # Create a dict of uploaded document types and their verification status
        doc_status = (
            {doc["doc_type"]: doc["verified"] for doc in all_uploaded_docs}
            if all_uploaded_docs
            else {}
        )

        # Check for missing required documents
        missing_docs = [doc for doc in required_docs if doc not in doc_status]

        if missing_docs:
            return (
                jsonify(
                    {
                        "error": "Cannot forward application. Missing required documents",
                        "missing_documents": missing_docs,
                    }
                ),
                400,
            )

        # Check for unverified documents (including required docs AND "Other" docs)
        unverified_docs = [
            doc_type for doc_type, verified in doc_status.items() if verified != True
        ]

        if unverified_docs:
            return (
                jsonify(
                    {
                        "error": 'Cannot forward application. All documents (including "Other" documents) must be verified by counsellor before forwarding',
                        "unverified_documents": unverified_docs,
                    }
                ),
                400,
            )

        # Update status to indicate it's been forwarded with detailed audit info
        action_type = "Re-forwarded" if is_reforward else "Forwarded"
        forward_note = f' [{action_type} to University by {current_user["full_name"]} ({current_user["role_name"]}) on {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}]'

        # Clear previous decision data when re-forwarding
        if is_reforward:
            db.execute_query(
                """UPDATE applications 
                   SET status = 'Forwarded to University',
                       decision_type = NULL,
                       decision_notes = NULL,
                       decision_date = NULL,
                       counsellor_notes = COALESCE(counsellor_notes, '') || %s
                   WHERE application_id = %s""",
                (forward_note, application_id),
                fetch=False,
            )
        else:
            db.execute_query(
                """UPDATE applications 
                   SET status = 'Forwarded to University', 
                       counsellor_notes = COALESCE(counsellor_notes, '') || %s
                   WHERE application_id = %s""",
                (forward_note, application_id),
                fetch=False,
            )

        # Notify student
        student_message = f'Your application to {app["university_name"]} has been {action_type.lower()} to the university for review by {current_user["full_name"]}.'
        if is_reforward:
            student_message += (
                " Additional documents have been submitted for consideration."
            )

        db.execute_query(
            """INSERT INTO notifications (user_id, title, message, triggered_by)
               VALUES (%s, %s, %s, %s)""",
            (
                app["student_user_id"],
                f"Application {action_type}",
                student_message,
                request.user_id,
            ),
            fetch=False,
        )

        # Notify university staff if portal user exists
        if app["portal_user_id"]:
            uni_message = f'Application from {app["student_name"]} for {app["program_name"]} {action_type.lower()} by {current_user["full_name"]} requires your review.'
            if is_reforward:
                uni_message += " New documents have been added since the previous conditional offer decision."

            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    app["portal_user_id"],
                    f"Application {action_type} for Review",
                    uni_message,
                    request.user_id,
                ),
                fetch=False,
            )

        # Comprehensive audit logging with details
        audit_details = f'Application ID: {application_id}, Student Name: {app["student_name"]}, University: {app["university_name"]}, Forwarded by: {current_user["full_name"]} ({current_user["role_name"]})'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Forward Application to University",
                "applications",
                application_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return (
            jsonify({"message": "Application forwarded to university successfully"}),
            200,
        )

    except Exception as e:
        logger.error(f"Forward application error: {e}")
        return jsonify({"error": "Failed to forward application"}), 500


@app.route("/api/applications/<int:application_id>/delete", methods=["DELETE"])
@token_required
@role_required(1, 2, 6)  # SuperAdmin, Admin, and Student
def delete_application(application_id):
    """Delete application (Admin and SuperAdmin can delete any, Students can delete their own if In Review)"""
    try:
        # Get application details for audit trail
        application = db.execute_one(
            """SELECT a.application_id, a.program_name, a.status, s.user_id as student_user_id,
                      u.full_name as student_name, uni.name as university_name
               FROM applications a
               JOIN students s ON a.student_id = s.student_id
               JOIN users u ON s.user_id = u.user_id
               JOIN universities uni ON a.university_id = uni.university_id
               WHERE a.application_id = %s""",
            (application_id,),
        )

        if not application:
            return jsonify({"error": "Application not found"}), 404

        # Students can only delete their own applications and only if status is "In Review"
        if request.role_id == 6:  # Student
            if application["student_user_id"] != request.user_id:
                return (
                    jsonify(
                        {
                            "error": "Access denied. You can only delete your own applications."
                        }
                    ),
                    403,
                )

            if application["status"] != "In Review":
                return (
                    jsonify(
                        {
                            "error": 'You can only delete applications with "In Review" status.'
                        }
                    ),
                    403,
                )

        # Log action BEFORE deletion for audit trail
        audit_details = f'DELETED Application - ID: {application_id}, Student: {application["student_name"]}, University: {application["university_name"]}, Program: {application["program_name"]}, Status: {application["status"]}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Delete Application",
                "applications",
                application_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Delete associated documents first (foreign key constraint)
        db.execute_query(
            "DELETE FROM documents WHERE application_id = %s",
            (application_id,),
            fetch=False,
        )

        # Delete the application
        db.execute_query(
            "DELETE FROM applications WHERE application_id = %s",
            (application_id,),
            fetch=False,
        )

        return (
            jsonify(
                {"message": "Application and associated documents deleted successfully"}
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Delete application error: {e}")
        return jsonify({"error": "Failed to delete application"}), 500


# ==================== DOCUMENT ROUTES ====================


@app.route("/api/documents", methods=["GET"])
@token_required
def get_documents():
    """Get documents based on user role"""
    try:
        # Ensure columns exist for two-stage verification
        try:
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uni_verified BOOLEAN",
                fetch=False,
            )
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uni_verification_notes TEXT",
                fetch=False,
            )
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uni_verified_by INTEGER",
                fetch=False,
            )
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uni_verified_at TIMESTAMP",
                fetch=False,
            )
        except Exception:
            pass  # Columns may already exist

        if request.role_id == 6:  # Student
            student = db.execute_one(
                "SELECT student_id FROM students WHERE user_id = %s", (request.user_id,)
            )
            if not student:
                return jsonify({"documents": []}), 200

            documents = db.execute_query(
                """SELECT document_id, doc_type, uploaded_at, verified, uni_verified, 
                          verification_notes, uni_verification_notes, application_id
                   FROM documents
                   WHERE student_id = %s
                   ORDER BY uploaded_at DESC""",
                (student["student_id"],),
            )
        elif request.role_id == 3:  # Counsellor
            documents = db.execute_query(
                """SELECT d.document_id, d.doc_type, d.uploaded_at, d.verified, d.uni_verified,
                          d.verification_notes, d.uni_verification_notes, d.application_id,
                          s.student_id, u.full_name as student_name
                   FROM documents d
                   JOIN students s ON d.student_id = s.student_id
                   JOIN users u ON s.user_id = u.user_id
                   WHERE s.assigned_counsellor_id = %s
                   ORDER BY d.uploaded_at DESC""",
                (request.user_id,),
            )
        elif (
            request.role_id == 4
        ):  # University Staff - see documents from forwarded or decided applications
            # Get the university for this staff member
            university = db.execute_one(
                "SELECT university_id FROM universities WHERE portal_user_id = %s",
                (request.user_id,),
            )
            print(
                f"University staff user_id: {request.user_id}, university: {university}"
            )
            if not university:
                return jsonify({"documents": []}), 200

            uni_id = university["university_id"]
            print(f"Fetching documents for university_id: {uni_id}")

            # Show documents from applications that were forwarded OR have decisions
            # (Forwarded to University, Decision: Accepted, Decision: Conditional, Decision: Rejected)
            documents = db.execute_query(
                """SELECT d.document_id, d.doc_type, d.uploaded_at, d.verified, d.uni_verified,
                          d.verification_notes, d.uni_verification_notes, d.application_id,
                          s.student_id, u.full_name as student_name, a.status as application_status
                   FROM documents d
                   JOIN students s ON d.student_id = s.student_id
                   JOIN users u ON s.user_id = u.user_id
                   JOIN applications a ON d.application_id = a.application_id
                   WHERE a.university_id = %s 
                   AND (a.status = 'Forwarded to University' OR a.status LIKE 'Decision:%%')
                   ORDER BY d.uploaded_at DESC""",
                (uni_id,),
            )
            print(f"Found {len(documents) if documents else 0} documents")
        else:  # Admin/Manager
            documents = db.execute_query(
                """SELECT d.document_id, d.doc_type, d.uploaded_at, d.verified, d.uni_verified,
                          d.verification_notes, d.uni_verification_notes, d.application_id,
                          s.student_id, u.full_name as student_name
                   FROM documents d
                   JOIN students s ON d.student_id = s.student_id
                   JOIN users u ON s.user_id = u.user_id
                   ORDER BY d.uploaded_at DESC"""
            )

        return jsonify({"documents": [dict(d) for d in documents]}), 200

    except Exception as e:
        import traceback

        logger.error(f"Get documents error: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        print(f"ERROR in get_documents: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": "Failed to get documents"}), 500


@app.route("/api/documents/<int:document_id>/download", methods=["GET"])
@token_required
def download_document(document_id):
    """Download and decrypt document"""
    try:
        # Get document with permissions check
        if request.role_id == 6:  # Student - can only download own documents
            document = db.execute_one(
                """SELECT d.*, s.user_id as student_user_id
                   FROM documents d
                   JOIN students s ON d.student_id = s.student_id
                   WHERE d.document_id = %s AND s.user_id = %s""",
                (document_id, request.user_id),
            )
        elif (
            request.role_id == 3
        ):  # Counsellor - can download assigned students' documents
            document = db.execute_one(
                """SELECT d.*, s.user_id as student_user_id
                   FROM documents d
                   JOIN students s ON d.student_id = s.student_id
                   WHERE d.document_id = %s AND s.assigned_counsellor_id = %s""",
                (document_id, request.user_id),
            )
        elif (
            request.role_id == 4
        ):  # University Staff - can download from forwarded or decided applications
            # Get the university for this staff member
            university = db.execute_one(
                "SELECT university_id FROM universities WHERE portal_user_id = %s",
                (request.user_id,),
            )
            if not university:
                return jsonify({"error": "University not found for this user"}), 404

            # Allow download if document is from a forwarded OR decided application to their university
            document = db.execute_one(
                """SELECT d.*, s.user_id as student_user_id
                   FROM documents d
                   JOIN students s ON d.student_id = s.student_id
                   JOIN applications a ON d.application_id = a.application_id
                   WHERE d.document_id = %s 
                   AND a.university_id = %s
                   AND (a.status = 'Forwarded to University' OR a.status LIKE 'Decision:%%')""",
                (document_id, university["university_id"]),
            )
        else:  # Admin/SuperAdmin - can download all documents
            document = db.execute_one(
                """SELECT d.*, s.user_id as student_user_id
                   FROM documents d
                   JOIN students s ON d.student_id = s.student_id
                   WHERE d.document_id = %s""",
                (document_id,),
            )

        if not document:
            return jsonify({"error": "Document not found or access denied"}), 404

        # Get student name for audit
        student_info = db.execute_one(
            """SELECT u.full_name as student_name
               FROM students s
               JOIN users u ON s.user_id = u.user_id
               WHERE s.student_id = %s""",
            (document["student_id"],),
        )

        # Decrypt document
        decrypted_data = encryption_service.decrypt_document(
            document["encrypted_blob"], document["iv"]
        )

        # Log download action with details
        audit_details = f'Document ID: {document_id}, Document Type: {document["doc_type"]}, Student Name: {student_info["student_name"] if student_info else "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Download Document",
                "documents",
                document_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Return file as download
        from flask import send_file
        from io import BytesIO

        return send_file(
            BytesIO(decrypted_data),
            download_name=f"{document['doc_type']}_{document_id}.pdf",
            as_attachment=True,
            mimetype="application/pdf",
        )

    except Exception as e:
        logger.error(f"Download document error: {e}")
        return jsonify({"error": "Failed to download document"}), 500


@app.route("/api/documents/upload", methods=["POST"])
@token_required
@role_required(6)  # Student only
def upload_document():
    """Upload encrypted document"""
    try:
        # Get student_id
        student = db.execute_one(
            "SELECT student_id FROM students WHERE user_id = %s", (request.user_id,)
        )
        if not student:
            return jsonify({"error": "Student profile not found"}), 404

        # Get file from request
        files = request.files.getlist("files")

if not files or len(files) == 0:
    return jsonify({"error": "No files provided"}), 400
        doc_type = request.form.get("doc_type")
        application_id = request.form.get(
            "application_id"
        )  # Get application_id from form

        if not doc_type:
            return jsonify({"error": "Document type required"}), 400

        if not application_id:
            return jsonify({"error": "Application ID required"}), 400

        # Verify application belongs to student
        application = db.execute_one(
            """SELECT application_id FROM applications 
               WHERE application_id = %s AND student_id = %s""",
            (application_id, student["student_id"]),
        )

        if not application:
            return jsonify({"error": "Application not found or access denied"}), 404

        # Read file content
        for file in files:
    file_content = file.read()

    encrypted_data, iv = encryption_service.encrypt_document(file_content)

    db.execute_one(
        """INSERT INTO documents 
           (student_id, uploaded_by, doc_type, encrypted_blob, iv, key_version, application_id, verified)
           VALUES (%s, %s, %s, %s, %s, %s, %s, NULL)""",
        (
            student["student_id"],
            request.user_id,
            doc_type,
            encrypted_data,
            iv,
            "v1",
            application_id,
        ),
    )

        # Store in database with application_id
        document = db.execute_one(
            """INSERT INTO documents (student_id, uploaded_by, doc_type, encrypted_blob, iv, key_version, application_id, verified)
               VALUES (%s, %s, %s, %s, %s, %s, %s, NULL)
               RETURNING document_id, uploaded_at""",
            (
                student["student_id"],
                request.user_id,
                doc_type,
                encrypted_data,
                iv,
                "v1",
                application_id,
            ),
        )

        # Get student name for audit
        student_info = db.execute_one(
            """SELECT u.full_name as student_name
               FROM students s
               JOIN users u ON s.user_id = u.user_id
               WHERE s.student_id = %s""",
            (student["student_id"],),
        )

        # Log action with details
        audit_details = f'Document ID: {document["document_id"]}, Document Type: {doc_type}, Application ID: {application_id}, Student Name: {student_info["student_name"] if student_info else "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Upload Document",
                "documents",
                document["document_id"],
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Notify counsellor if assigned
        if student:
            student_info = db.execute_one(
                "SELECT assigned_counsellor_id FROM students WHERE student_id = %s",
                (student["student_id"],),
            )
            if student_info and student_info["assigned_counsellor_id"]:
                db.execute_query(
                    """INSERT INTO notifications (user_id, title, message, triggered_by)
                       VALUES (%s, %s, %s, %s)""",
                    (
                        student_info["assigned_counsellor_id"],
                        "New Document Uploaded",
                        f"A student has uploaded a new document: {doc_type}",
                        request.user_id,
                    ),
                    fetch=False,
                )

        return (
            jsonify(
                {
                    "message": "Document uploaded successfully",
                    "document_id": document["document_id"],
                }
            ),
            201,
        )

    except Exception as e:
        logger.error(f"Upload document error: {e}")
        return jsonify({"error": "Failed to upload document"}), 500


@app.route("/api/documents/<int:document_id>/verify", methods=["PUT"])
@token_required
@role_required(1, 2, 3, 4)  # SuperAdmin, Admin, Counsellor, University Staff
def verify_document(document_id):
    """Verify document"""
    try:
        data = request.json or {}
        # support action: approve / reject and optional notes
        action = data.get("action", "approve")
        notes = data.get("notes")

        # Get document info first
        document = db.execute_one(
            """SELECT d.document_id, d.student_id, d.application_id, s.assigned_counsellor_id
               FROM documents d
               JOIN students s ON d.student_id = s.student_id
               WHERE d.document_id = %s""",
            (document_id,),
        )

        if not document:
            return jsonify({"error": "Document not found"}), 404

        # If user is counsellor, ensure they are assigned to this student
        if request.role_id == 3:  # Counsellor
            if document["assigned_counsellor_id"] != request.user_id:
                return (
                    jsonify(
                        {
                            "error": "Access denied. This document belongs to a student not assigned to you."
                        }
                    ),
                    403,
                )

        # If user is university staff, ensure the document's application belongs to their university
        # AND that the counsellor has already verified it (Stage 1 must be complete before Stage 2)
        if request.role_id == 4:  # University Staff
            # Get the university for this staff member
            university = db.execute_one(
                "SELECT university_id FROM universities WHERE portal_user_id = %s",
                (request.user_id,),
            )
            if not university:
                return jsonify({"error": "University not found for this user"}), 404

            # Check if the document's application belongs to this university and is forwarded or has decision
            if document["application_id"]:
                app = db.execute_one(
                    "SELECT university_id, status FROM applications WHERE application_id = %s",
                    (document["application_id"],),
                )
                if not app or app["university_id"] != university["university_id"]:
                    return (
                        jsonify(
                            {
                                "error": "Access denied. This document is not for your university."
                            }
                        ),
                        403,
                    )

                # Allow verification for forwarded or decided applications
                if app["status"] not in ["Forwarded to University"] and not app[
                    "status"
                ].startswith("Decision:"):
                    return (
                        jsonify(
                            {
                                "error": "Cannot verify document. Application has not been forwarded yet."
                            }
                        ),
                        403,
                    )
            else:
                return (
                    jsonify(
                        {
                            "error": "Cannot verify document that is not associated with an application."
                        }
                    ),
                    403,
                )

            # Check if counsellor has verified this document first (Stage 1 must be complete)
            doc_verification = db.execute_one(
                "SELECT verified FROM documents WHERE document_id = %s", (document_id,)
            )
            if not doc_verification or not doc_verification.get("verified"):
                return (
                    jsonify(
                        {
                            "error": "Cannot verify document. Document must be verified by counsellor first (Stage 1)."
                        }
                    ),
                    403,
                )

        # ensure optional columns exist
        try:
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS verification_notes TEXT",
                fetch=False,
            )
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS verified_by INTEGER",
                fetch=False,
            )
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP",
                fetch=False,
            )
            # Add columns for university staff verification (second stage)
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uni_verified BOOLEAN",
                fetch=False,
            )
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uni_verification_notes TEXT",
                fetch=False,
            )
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uni_verified_by INTEGER",
                fetch=False,
            )
            db.execute_query(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uni_verified_at TIMESTAMP",
                fetch=False,
            )
        except Exception:
            # ignore DDL errors if any
            pass

        # Two-stage verification:
        # Stage 1: Counsellor/Admin/SuperAdmin verifies (verified column)
        # Stage 2: University Staff verifies (uni_verified column)

        if request.role_id in [1, 2, 3]:  # SuperAdmin, Admin, Counsellor - Stage 1
            verified = True if action == "approve" else False
            db.execute_query(
                """UPDATE documents SET verified = %s, verification_notes = %s, 
                              verified_by = %s, verified_at = NOW() WHERE document_id = %s""",
                (verified, notes, request.user_id, document_id),
                fetch=False,
            )
            stage = "Stage 1 (Counsellor)"
        elif request.role_id == 4:  # University Staff - Stage 2
            verified = True if action == "approve" else False
            db.execute_query(
                """UPDATE documents SET uni_verified = %s, uni_verification_notes = %s, 
                              uni_verified_by = %s, uni_verified_at = NOW() WHERE document_id = %s""",
                (verified, notes, request.user_id, document_id),
                fetch=False,
            )
            stage = "Stage 2 (University)"

        # Get document and student info for audit
        doc_info = db.execute_one(
            """SELECT d.doc_type, u.full_name as student_name
               FROM documents d
               JOIN students s ON d.student_id = s.student_id
               JOIN users u ON s.user_id = u.user_id
               WHERE d.document_id = %s""",
            (document_id,),
        )

        # Log action with details
        audit_details = f'Document ID: {document_id}, Action: {"Approve" if verified else "Reject"} ({stage}), Document Type: {doc_info["doc_type"] if doc_info else "N/A"}, Student Name: {doc_info["student_name"] if doc_info else "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                f'{"Approve" if verified else "Reject"} Document ({stage})',
                "documents",
                document_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Notify student owner of document
        owner = db.execute_one(
            "SELECT s.user_id FROM students s JOIN documents d ON d.student_id = s.student_id WHERE d.document_id = %s",
            (document_id,),
        )
        if owner:
            status_text = "approved" if verified else "rejected"
            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    owner["user_id"],
                    f"Document {status_text.title()} ({stage})",
                    f'Your document has been {status_text} by {stage}. Notes: {notes or ""}',
                    request.user_id,
                ),
                fetch=False,
            )

        return (
            jsonify({"message": "Document verification updated", "verified": verified}),
            200,
        )

    except Exception as e:
        logger.error(f"Verify document error: {e}")
        return jsonify({"error": "Failed to verify document"}), 500


@app.route("/api/documents/<int:document_id>/delete", methods=["DELETE"])
@token_required
@role_required(1, 2, 3, 6)  # SuperAdmin, Admin, Counsellor, Student
def delete_document(document_id):
    """Delete document (Student, Admin, SuperAdmin, Counsellor can delete documents)"""
    try:
        # Get document info and verify ownership/access
        document = db.execute_one(
            """SELECT d.document_id, d.doc_type, d.student_id, s.user_id, s.assigned_counsellor_id,
                      u.full_name as student_name
               FROM documents d
               JOIN students s ON d.student_id = s.student_id
               JOIN users u ON s.user_id = u.user_id
               WHERE d.document_id = %s""",
            (document_id,),
        )

        if not document:
            return jsonify({"error": "Document not found"}), 404

        # Access control based on role
        if request.role_id == 6:  # Student
            # Students can only delete their own documents
            if document["user_id"] != request.user_id:
                return (
                    jsonify(
                        {
                            "error": "Access denied. You can only delete your own documents."
                        }
                    ),
                    403,
                )
        elif request.role_id == 3:  # Counsellor
            # Counsellors can only delete documents of their assigned students
            if document["assigned_counsellor_id"] != request.user_id:
                return (
                    jsonify(
                        {
                            "error": "Access denied. You can only delete documents of your assigned students."
                        }
                    ),
                    403,
                )
        # SuperAdmin (1) and Admin (2) can delete any document - no additional check needed

        # Log action BEFORE deletion for audit trail
        audit_details = f'DELETED Document - ID: {document_id}, Type: {document["doc_type"]}, Student Name: {document["student_name"]}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Delete Document",
                "documents",
                document_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Delete the document
        db.execute_query(
            "DELETE FROM documents WHERE document_id = %s", (document_id,), fetch=False
        )

        return jsonify({"message": "Document deleted successfully"}), 200

    except Exception as e:
        logger.error(f"Delete document error: {e}")
        return jsonify({"error": "Failed to delete document"}), 500


# ==================== UNIVERSITY ROUTES ====================


@app.route("/api/universities", methods=["GET"])
@token_required
def get_universities():
    """Get all universities"""
    try:
        universities = db.execute_query(
            """SELECT university_id, name, country, contact_email, portal_user_id, created_at
               FROM universities
               ORDER BY name"""
        )

        return jsonify({"universities": [dict(u) for u in universities]}), 200

    except Exception as e:
        logger.error(f"Get universities error: {e}")
        return jsonify({"error": "Failed to get universities"}), 500


@app.route("/api/universities", methods=["POST"])
@token_required
@role_required(1, 2)  # SuperAdmin and Admin only
def create_university():
    """Create new university (Admin only)"""
    try:
        data = request.json
        name = data.get("name")
        country = data.get("country")
        contact_email = data.get("contact_email")

        if not name:
            return jsonify({"error": "University name is required"}), 400

        # Check if university name already exists
        existing = db.execute_one(
            "SELECT university_id FROM universities WHERE name = %s", (name,)
        )
        if existing:
            return jsonify({"error": "University with this name already exists"}), 400

        # Insert university
        university = db.execute_one(
            """INSERT INTO universities (name, country, contact_email)
               VALUES (%s, %s, %s)
               RETURNING university_id, name, country, contact_email, created_at""",
            (name, country, contact_email),
        )

        # Audit logging
        audit_details = f'New University - ID: {university["university_id"]}, Name: {name}, Country: {country or "N/A"}, Contact: {contact_email or "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Create University",
                "universities",
                university["university_id"],
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return (
            jsonify(
                {
                    "message": "University created successfully",
                    "university": dict(university),
                }
            ),
            201,
        )

    except Exception as e:
        logger.error(f"Create university error: {e}")
        return jsonify({"error": "Failed to create university"}), 500


@app.route("/api/universities/<int:university_id>", methods=["PUT"])
@token_required
@role_required(1, 2)  # SuperAdmin and Admin only
def update_university(university_id):
    """Update university information"""
    try:
        data = request.json
        name = data.get("name")
        country = data.get("country")
        contact_email = data.get("contact_email")

        # Get current university
        university = db.execute_one(
            "SELECT university_id, name FROM universities WHERE university_id = %s",
            (university_id,),
        )

        if not university:
            return jsonify({"error": "University not found"}), 404

        # Check if name is being changed and if new name already exists
        if name and name != university["name"]:
            existing = db.execute_one(
                "SELECT university_id FROM universities WHERE name = %s AND university_id != %s",
                (name, university_id),
            )
            if existing:
                return (
                    jsonify({"error": "University with this name already exists"}),
                    400,
                )

        # Build update query dynamically
        update_fields = []
        params = []

        if name:
            update_fields.append("name = %s")
            params.append(name)

        if country is not None:  # Allow empty string to clear field
            update_fields.append("country = %s")
            params.append(country if country else None)

        if contact_email is not None:  # Allow empty string to clear field
            update_fields.append("contact_email = %s")
            params.append(contact_email if contact_email else None)

        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400

        params.append(university_id)

        # Update university
        db.execute_query(
            f"UPDATE universities SET {', '.join(update_fields)} WHERE university_id = %s",
            tuple(params),
            fetch=False,
        )

        # Audit logging
        audit_details = f'Updated University - ID: {university_id}, Name: {name or "unchanged"}, Country: {country if country is not None else "unchanged"}, Contact: {contact_email if contact_email is not None else "unchanged"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Update University",
                "universities",
                university_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return jsonify({"message": "University updated successfully"}), 200

    except Exception as e:
        logger.error(f"Update university error: {e}")
        return jsonify({"error": "Failed to update university"}), 500


@app.route("/api/universities/<int:university_id>/delete", methods=["DELETE"])
@token_required
@role_required(1, 2)  # SuperAdmin and Admin only
def delete_university(university_id):
    """Delete university and deactivate all associated university staff accounts"""
    try:
        # Get university details for audit log before deletion
        university = db.execute_one(
            "SELECT university_id, name, country, contact_email FROM universities WHERE university_id = %s",
            (university_id,),
        )

        if not university:
            return jsonify({"error": "University not found"}), 404

        # Get count of associated university staff
        staff_count = db.execute_one(
            """SELECT COUNT(*) as count FROM users 
               WHERE role_id = 4 AND user_id IN (
                   SELECT portal_user_id FROM universities WHERE university_id = %s
               )""",
            (university_id,),
        )

        # Deactivate all university staff associated with this university
        db.execute_query(
            """UPDATE users 
               SET is_active = FALSE 
               WHERE role_id = 4 AND user_id IN (
                   SELECT portal_user_id FROM universities WHERE university_id = %s
               )""",
            (university_id,),
            fetch=False,
        )

        # Clear the portal_user_id reference before deletion
        db.execute_query(
            "UPDATE universities SET portal_user_id = NULL WHERE university_id = %s",
            (university_id,),
            fetch=False,
        )

        # Delete the university
        db.execute_query(
            "DELETE FROM universities WHERE university_id = %s",
            (university_id,),
            fetch=False,
        )

        # Audit logging
        audit_details = f'Deleted University - ID: {university["university_id"]}, Name: {university["name"]}, Country: {university["country"] or "N/A"}, Contact: {university["contact_email"] or "N/A"}, Deactivated Staff: {staff_count["count"]}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Delete University",
                "universities",
                university_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return (
            jsonify(
                {
                    "message": f'University deleted successfully. {staff_count["count"]} university staff account(s) deactivated.',
                    "deactivated_staff_count": staff_count["count"],
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Delete university error: {e}")
        return jsonify({"error": "Failed to delete university"}), 500


# ==================== UNIVERSITY INTAKES ROUTES ====================


@app.route("/api/universities/<int:university_id>/intakes", methods=["GET"])
@token_required
def get_university_intakes(university_id):
    """Get all intakes for a specific university"""
    try:
        # Verify university exists
        university = db.execute_one(
            "SELECT university_id FROM universities WHERE university_id = %s",
            (university_id,),
        )
        if not university:
            return jsonify({"error": "University not found"}), 404

        intakes = db.execute_query(
            """SELECT intake_id, university_id, intake_name, intake_year, start_date, end_date, is_active, created_at
               FROM intakes
               WHERE university_id = %s
               ORDER BY intake_year DESC, intake_name ASC""",
            (university_id,),
        )

        return jsonify({"intakes": [dict(i) for i in intakes]}), 200

    except Exception as e:
        logger.error(f"Get intakes error: {e}")
        return jsonify({"error": "Failed to get intakes"}), 500


@app.route("/api/universities/<int:university_id>/intakes", methods=["POST"])
@token_required
@role_required(1, 2, 4)  # SuperAdmin, Admin, University Staff
def create_intake(university_id):
    """Create new intake for a university"""
    try:
        data = request.json
        intake_name = data.get("intake_name")
        intake_year = data.get("intake_year")
        start_date = data.get("start_date")
        end_date = data.get("end_date")

        if not intake_name:
            return jsonify({"error": "Intake name is required"}), 400

        # Verify university exists
        university = db.execute_one(
            "SELECT university_id, name FROM universities WHERE university_id = %s",
            (university_id,),
        )
        if not university:
            return jsonify({"error": "University not found"}), 404

        # If user is University Staff, verify they own this university
        if request.role_id == 4:
            staff_university = db.execute_one(
                "SELECT university_id FROM universities WHERE portal_user_id = %s",
                (request.user_id,),
            )
            if (
                not staff_university
                or staff_university["university_id"] != university_id
            ):
                return (
                    jsonify(
                        {
                            "error": "Access denied. You can only manage intakes for your university"
                        }
                    ),
                    403,
                )

        # Check for duplicate intake (same name, year for same university)
        existing = db.execute_one(
            """SELECT intake_id FROM intakes 
               WHERE university_id = %s AND intake_name = %s AND intake_year = %s""",
            (university_id, intake_name, intake_year),
        )
        if existing:
            return (
                jsonify({"error": "This intake already exists for this university"}),
                400,
            )

        # Create intake
        intake = db.execute_one(
            """INSERT INTO intakes (university_id, intake_name, intake_year, start_date, end_date, is_active)
               VALUES (%s, %s, %s, %s, %s, TRUE)
               RETURNING intake_id, intake_name, intake_year, start_date, end_date, is_active, created_at""",
            (university_id, intake_name, intake_year, start_date, end_date),
        )

        # Audit logging
        audit_details = f'Created Intake - ID: {intake["intake_id"]}, University: {university["name"]}, Name: {intake_name}, Year: {intake_year or "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Create Intake",
                "intakes",
                intake["intake_id"],
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return (
            jsonify({"message": "Intake created successfully", "intake": dict(intake)}),
            201,
        )

    except Exception as e:
        logger.error(f"Create intake error: {e}")
        return jsonify({"error": "Failed to create intake"}), 500


@app.route("/api/intakes/<int:intake_id>", methods=["PUT", "DELETE"])
@token_required
@role_required(1, 2, 4)  # SuperAdmin, Admin, University Staff
def manage_intake(intake_id):
    """Update or delete an intake"""
    try:
        # Get intake details
        intake = db.execute_one(
            """SELECT intake_id, university_id, intake_name FROM intakes 
               WHERE intake_id = %s""",
            (intake_id,),
        )
        if not intake:
            return jsonify({"error": "Intake not found"}), 404

        # If user is University Staff, verify they own this university
        if request.role_id == 4:
            staff_university = db.execute_one(
                "SELECT university_id FROM universities WHERE portal_user_id = %s",
                (request.user_id,),
            )
            if (
                not staff_university
                or staff_university["university_id"] != intake["university_id"]
            ):
                return (
                    jsonify(
                        {
                            "error": "Access denied. You can only manage intakes for your university"
                        }
                    ),
                    403,
                )

        # Handle PUT request (update)
        if request.method == "PUT":
            data = request.json

            # Build update query dynamically
            update_fields = []
            params = []

            if "intake_name" in data:
                update_fields.append("intake_name = %s")
                params.append(data["intake_name"])

            if "intake_year" in data:
                update_fields.append("intake_year = %s")
                params.append(data["intake_year"])

            if "start_date" in data:
                update_fields.append("start_date = %s")
                params.append(data["start_date"])

            if "end_date" in data:
                update_fields.append("end_date = %s")
                params.append(data["end_date"])

            if "is_active" in data:
                update_fields.append("is_active = %s")
                params.append(data["is_active"])

            if not update_fields:
                return jsonify({"error": "No fields to update"}), 400

            update_fields.append("updated_at = NOW()")
            params.append(intake_id)

            # Update intake
            db.execute_query(
                f"UPDATE intakes SET {', '.join(update_fields)} WHERE intake_id = %s",
                tuple(params),
                fetch=False,
            )

            # Audit logging
            audit_details = (
                f'Updated Intake - ID: {intake_id}, Changes: {", ".join(data.keys())}'
            )
            db.execute_query(
                """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (
                    request.user_id,
                    "Update Intake",
                    "intakes",
                    intake_id,
                    get_client_ip(request),
                    audit_details,
                ),
                fetch=False,
            )

            return jsonify({"message": "Intake updated successfully"}), 200

        # Handle DELETE request
        elif request.method == "DELETE":
            # Check if any applications use this intake
            applications = db.execute_one(
                "SELECT COUNT(*) as count FROM applications WHERE intake = %s",
                (intake["intake_name"],),
            )

            if applications["count"] > 0:
                return (
                    jsonify(
                        {
                            "error": f"Cannot delete intake. It is associated with {applications['count']} application(s)."
                        }
                    ),
                    400,
                )

            # Delete intake
            db.execute_query(
                "DELETE FROM intakes WHERE intake_id = %s",
                (intake_id,),
                fetch=False,
            )

            # Audit logging
            audit_details = (
                f'Deleted Intake - ID: {intake_id}, Name: {intake["intake_name"]}'
            )
            db.execute_query(
                """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (
                    request.user_id,
                    "Delete Intake",
                    "intakes",
                    intake_id,
                    get_client_ip(request),
                    audit_details,
                ),
                fetch=False,
            )

            return jsonify({"message": "Intake deleted successfully"}), 200

    except Exception as e:
        logger.error(f"Manage intake error: {e}")
        return jsonify({"error": "Failed to manage intake"}), 500


@app.route("/api/students/<int:student_id>", methods=["GET"])
@token_required
@role_required(1, 2, 3)  # SuperAdmin, Admin, Counsellor
def get_student_detail(student_id):
    """Get student profile, documents and applications for counsellor/admin view"""
    try:
        logger.info(
            f"Fetching student detail for student_id: {student_id}, user_id: {request.user_id}, role_id: {request.role_id}"
        )

        # For counsellors, check if this student is assigned to them
        if request.role_id == 3:  # Counsellor
            access_check = db.execute_one(
                """SELECT student_id FROM students 
                   WHERE student_id = %s AND assigned_counsellor_id = %s""",
                (student_id, request.user_id),
            )
            if not access_check:
                logger.warning(
                    f"Counsellor {request.user_id} attempted to access unassigned student {student_id}"
                )
                return (
                    jsonify(
                        {"error": "Access denied. This student is not assigned to you"}
                    ),
                    403,
                )

        student = db.execute_one(
            """SELECT s.*, u.full_name, u.email, u.created_at as user_created_at,
                          c.full_name as counsellor_name, c.email as counsellor_email,
                          l.full_name as logistics_name, l.email as logistics_email
               FROM students s
               JOIN users u ON s.user_id = u.user_id
               LEFT JOIN users c ON s.assigned_counsellor_id = c.user_id
               LEFT JOIN users l ON s.assigned_logistics_id = l.user_id
               WHERE s.student_id = %s""",
            (student_id,),
        )

        logger.info(f"Student query result: {student}")

        if not student:
            logger.warning(f"Student not found with id: {student_id}")
            return jsonify({"error": "Student not found"}), 404

        logger.info(f"Fetching documents for student_id: {student_id}")
        documents = db.execute_query(
            """SELECT document_id, doc_type, uploaded_at, verified, verification_notes, verified_by, verified_at, application_id
               FROM documents WHERE student_id = %s ORDER BY uploaded_at DESC""",
            (student_id,),
        )
        logger.info(f"Documents count: {len(documents) if documents else 0}")

        logger.info(f"Fetching applications for student_id: {student_id}")
        applications = db.execute_query(
            """SELECT a.application_id, a.student_id, a.counsellor_id, a.university_id, 
                      a.program_name, a.status, a.submitted_at, a.decision_date, 
                      a.decision_type, a.decision_notes, a.created_at, a.counsellor_notes,
                      a.conditional_offer_filename, a.conditional_requirements,
                      a.conditional_documents_uploaded, a.conditional_verified_by_counsellor,
                      a.conditional_verified_by_university,
                      CASE WHEN a.conditional_offer_encrypted_blob IS NOT NULL THEN true ELSE false END as has_conditional_offer,
                      u.name as university_name, u.country
               FROM applications a
               LEFT JOIN universities u ON a.university_id = u.university_id
               WHERE a.student_id = %s
               ORDER BY a.created_at DESC""",
            (student_id,),
        )
        logger.info(f"Applications count: {len(applications) if applications else 0}")

        return (
            jsonify(
                {
                    "student": dict(student),
                    "documents": [dict(d) for d in documents] if documents else [],
                    "applications": (
                        [dict(a) for a in applications] if applications else []
                    ),
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Get student detail error: {e}", exc_info=True)
        return jsonify({"error": "Failed to get student details"}), 500


# ==================== MESSAGE ROUTES ====================

# Connected users (user_id -> socket_id mapping)
connected_users = {}


@app.route("/api/chat/conversations", methods=["GET"])
@token_required
def get_conversations():
    """Get all chat conversations for current user"""
    try:
        # Get current user's role
        user = db.execute_one(
            "SELECT role_id FROM users WHERE user_id = %s", (request.user_id,)
        )

        role_id = user["role_id"]

        # SuperAdmin can see ALL conversations in the system
        if role_id == 1:
            conversations = db.execute_query(
                """WITH all_conversations AS (
                       SELECT DISTINCT
                           m.sender_id,
                           m.receiver_id
                       FROM messages m
                   )
                   SELECT 
                       ac.sender_id,
                       ac.receiver_id,
                       u1.full_name as sender_name,
                       u1.email as sender_email,
                       r1.role_name as sender_role,
                       u2.full_name as receiver_name,
                       u2.email as receiver_email,
                       r2.role_name as receiver_role,
                       (SELECT body FROM messages 
                        WHERE (sender_id = ac.sender_id AND receiver_id = ac.receiver_id) 
                           OR (sender_id = ac.receiver_id AND receiver_id = ac.sender_id)
                        ORDER BY created_at DESC LIMIT 1) as last_message,
                       (SELECT created_at FROM messages 
                        WHERE (sender_id = ac.sender_id AND receiver_id = ac.receiver_id) 
                           OR (sender_id = ac.receiver_id AND receiver_id = ac.sender_id)
                        ORDER BY created_at DESC LIMIT 1) as last_message_time,
                       (SELECT COUNT(*) FROM messages 
                        WHERE sender_id = ac.sender_id AND receiver_id = ac.receiver_id AND is_read = FALSE) as unread_count
                   FROM all_conversations ac
                   JOIN users u1 ON ac.sender_id = u1.user_id
                   JOIN roles r1 ON u1.role_id = r1.role_id
                   JOIN users u2 ON ac.receiver_id = u2.user_id
                   JOIN roles r2 ON u2.role_id = r2.role_id
                   ORDER BY last_message_time DESC NULLS LAST"""
            )

            # Format for SuperAdmin view (show both parties)
            formatted_conversations = []
            seen_pairs = set()
            for conv in conversations:
                # Create a unique pair identifier (sort IDs to avoid duplicates)
                pair = tuple(sorted([conv["sender_id"], conv["receiver_id"]]))
                if pair not in seen_pairs:
                    seen_pairs.add(pair)

                    # Check if SuperAdmin is a participant in this conversation
                    is_participant = request.user_id in [
                        conv["sender_id"],
                        conv["receiver_id"],
                    ]

                    if is_participant:
                        # SuperAdmin is part of this conversation - show as normal conversation
                        other_user_id = (
                            conv["receiver_id"]
                            if conv["sender_id"] == request.user_id
                            else conv["sender_id"]
                        )
                        other_user_name = (
                            conv["receiver_name"]
                            if conv["sender_id"] == request.user_id
                            else conv["sender_name"]
                        )
                        other_user_email = (
                            conv["receiver_email"]
                            if conv["sender_id"] == request.user_id
                            else conv["sender_email"]
                        )
                        other_user_role = (
                            conv["receiver_role"]
                            if conv["sender_id"] == request.user_id
                            else conv["sender_role"]
                        )

                        formatted_conversations.append(
                            {
                                "other_user_id": other_user_id,
                                "other_user_name": other_user_name,
                                "other_user_email": other_user_email,
                                "other_user_role": other_user_role,
                                "last_message": conv["last_message"],
                                "last_message_time": conv["last_message_time"],
                                "unread_count": conv["unread_count"],
                                "is_admin_view": False,
                                "participant_ids": None,  # SuperAdmin is participant, not monitoring
                            }
                        )
                    else:
                        # SuperAdmin is NOT part of this conversation - show as monitoring view
                        formatted_conversations.append(
                            {
                                "other_user_id": conv["receiver_id"],
                                "other_user_name": f"{conv['sender_name']} ↔ {conv['receiver_name']}",
                                "other_user_email": f"{conv['sender_email']} | {conv['receiver_email']}",
                                "other_user_role": f"{conv['sender_role']} ↔ {conv['receiver_role']}",
                                "last_message": conv["last_message"],
                                "last_message_time": conv["last_message_time"],
                                "unread_count": conv["unread_count"],
                                "is_admin_view": True,
                                "participant_ids": [
                                    conv["sender_id"],
                                    conv["receiver_id"],
                                ],
                            }
                        )

            return jsonify({"conversations": formatted_conversations}), 200

        else:
            # Regular users see only their own conversations
            conversations = db.execute_query(
                """WITH user_conversations AS (
                       SELECT DISTINCT
                           CASE 
                               WHEN m.sender_id = %s THEN m.receiver_id
                               ELSE m.sender_id
                           END as other_user_id
                       FROM messages m
                       WHERE m.sender_id = %s OR m.receiver_id = %s
                   )
                   SELECT 
                       uc.other_user_id,
                       u.full_name as other_user_name,
                       u.email as other_user_email,
                       r.role_name as other_user_role,
                       (SELECT body FROM messages 
                        WHERE (sender_id = %s AND receiver_id = uc.other_user_id) 
                           OR (sender_id = uc.other_user_id AND receiver_id = %s)
                        ORDER BY created_at DESC LIMIT 1) as last_message,
                       (SELECT created_at FROM messages 
                        WHERE (sender_id = %s AND receiver_id = uc.other_user_id) 
                           OR (sender_id = uc.other_user_id AND receiver_id = %s)
                        ORDER BY created_at DESC LIMIT 1) as last_message_time,
                       (SELECT COUNT(*) FROM messages 
                        WHERE sender_id = uc.other_user_id AND receiver_id = %s AND is_read = FALSE) as unread_count
                   FROM user_conversations uc
                   JOIN users u ON uc.other_user_id = u.user_id
                   JOIN roles r ON u.role_id = r.role_id
                   ORDER BY last_message_time DESC NULLS LAST""",
                (
                    request.user_id,
                    request.user_id,
                    request.user_id,
                    request.user_id,
                    request.user_id,
                    request.user_id,
                    request.user_id,
                    request.user_id,
                ),
            )

            return jsonify({"conversations": [dict(c) for c in conversations]}), 200

    except Exception as e:
        logger.error(f"Get conversations error: {e}")
        return jsonify({"error": "Failed to get conversations"}), 500


@app.route("/api/chat/messages/<int:other_user_id>", methods=["GET"])
@token_required
def get_chat_messages(other_user_id):
    """Get chat messages between current user and another user (or between two users for SuperAdmin)"""
    try:
        # Get current user's role
        user = db.execute_one(
            "SELECT role_id FROM users WHERE user_id = %s", (request.user_id,)
        )

        role_id = user["role_id"]

        # For SuperAdmin, check if viewing conversation between two other users
        # Format: /api/chat/messages/user1_id?with=user2_id
        if role_id == 1 and request.args.get("with"):
            # SuperAdmin viewing conversation between two other users
            user2_id = int(request.args.get("with"))
            messages = db.execute_query(
                """SELECT m.*, 
                          s.full_name as sender_name,
                          s.email as sender_email
                   FROM messages m
                   JOIN users s ON m.sender_id = s.user_id
                   WHERE (m.sender_id = %s AND m.receiver_id = %s)
                      OR (m.sender_id = %s AND m.receiver_id = %s)
                   ORDER BY m.created_at ASC""",
                (other_user_id, user2_id, user2_id, other_user_id),
            )
            # Don't mark as read for SuperAdmin viewing
        else:
            # Normal conversation view
            messages = db.execute_query(
                """SELECT m.*, 
                          s.full_name as sender_name,
                          s.email as sender_email
                   FROM messages m
                   JOIN users s ON m.sender_id = s.user_id
                   WHERE (m.sender_id = %s AND m.receiver_id = %s)
                      OR (m.sender_id = %s AND m.receiver_id = %s)
                   ORDER BY m.created_at ASC""",
                (request.user_id, other_user_id, other_user_id, request.user_id),
            )

            # Mark received messages as read (only for non-SuperAdmin or own messages)
            if role_id != 1 or not request.args.get("with"):
                db.execute_query(
                    """UPDATE messages SET is_read = TRUE 
                       WHERE sender_id = %s AND receiver_id = %s AND is_read = FALSE""",
                    (other_user_id, request.user_id),
                    fetch=False,
                )

        return jsonify({"messages": [dict(m) for m in messages]}), 200

    except Exception as e:
        logger.error(f"Get chat messages error: {e}")
        return jsonify({"error": "Failed to get messages"}), 500


@app.route("/api/chat/users", methods=["GET"])
@token_required
def get_chat_users():
    """Get list of users current user can chat with based on role"""
    try:
        # Get current user's role
        user = db.execute_one(
            "SELECT role_id FROM users WHERE user_id = %s", (request.user_id,)
        )

        role_id = user["role_id"]

        # Define chat permissions based on roles
        # 1=SuperAdmin, 2=Admin, 3=Counsellor, 4=University, 5=Logistics, 6=Student
        if role_id == 1:  # SuperAdmin can chat with everyone
            users = db.execute_query(
                """SELECT u.user_id, u.full_name, u.email, r.role_name
                   FROM users u
                   JOIN roles r ON u.role_id = r.role_id
                   WHERE u.user_id != %s AND u.is_active = TRUE
                   ORDER BY u.full_name""",
                (request.user_id,),
            )
        elif (
            role_id == 2
        ):  # Admin can chat with ALL users (SuperAdmin, Admins, Counsellors, University Staff, Logistics Staff, Students)
            users = db.execute_query(
                """SELECT u.user_id, u.full_name, u.email, r.role_name
                   FROM users u
                   JOIN roles r ON u.role_id = r.role_id
                   WHERE u.user_id != %s 
                   AND u.is_active = TRUE
                   ORDER BY r.role_id, u.full_name""",
                (request.user_id,),
            )
        elif (
            role_id == 3
        ):  # Counsellor can chat with Admins, other Counsellors, University Staff, ALL Logistics Staff, their Students (NO SuperAdmin)
            users = db.execute_query(
                """SELECT u.user_id, u.full_name, u.email, r.role_name
                   FROM users u
                   JOIN roles r ON u.role_id = r.role_id
                   WHERE u.user_id != %s 
                   AND (u.role_id IN (2, 3, 4, 5)
                        OR (u.role_id = 6 AND EXISTS (
                            SELECT 1 FROM students s 
                            WHERE s.user_id = u.user_id AND s.assigned_counsellor_id = %s
                        )))
                   AND u.is_active = TRUE
                   ORDER BY r.role_id, u.full_name""",
                (request.user_id, request.user_id),
            )
        elif role_id == 4:  # University Staff can chat with Admins and Counsellors only
            users = db.execute_query(
                """SELECT u.user_id, u.full_name, u.email, r.role_name
                   FROM users u
                   JOIN roles r ON u.role_id = r.role_id
                   WHERE u.user_id != %s 
                   AND u.role_id IN (2, 3)
                   AND u.is_active = TRUE
                   ORDER BY r.role_id, u.full_name""",
                (request.user_id,),
            )
        elif (
            role_id == 5
        ):  # Logistics Staff can chat with Admins, Counsellors, other Logistics Staff, and their assigned Students
            users = db.execute_query(
                """SELECT DISTINCT ON (u.user_id) u.user_id, u.full_name, u.email, r.role_name, r.role_id as role_sort
                   FROM users u
                   JOIN roles r ON u.role_id = r.role_id
                   WHERE u.user_id != %s 
                   AND u.is_active = TRUE
                   AND (
                       u.role_id IN (2, 3, 5)
                       OR 
                       (u.role_id = 6 AND EXISTS (
                           SELECT 1 FROM students s
                           WHERE s.user_id = u.user_id AND s.assigned_logistics_id = %s
                       ))
                   )
                   ORDER BY u.user_id, r.role_id, u.full_name""",
                (request.user_id, request.user_id),
            )
        elif (
            role_id == 6
        ):  # Student can ONLY chat with: assigned counsellor, assigned logistics staff, and all admins
            users = db.execute_query(
                """SELECT DISTINCT ON (u.user_id) u.user_id, u.full_name, u.email, r.role_name, r.role_id as role_sort
                   FROM users u
                   JOIN roles r ON u.role_id = r.role_id
                   WHERE u.is_active = TRUE
                   AND (
                       -- Assigned Counsellor
                       u.user_id IN (
                           SELECT s.assigned_counsellor_id 
                           FROM students s 
                           WHERE s.user_id = %s AND s.assigned_counsellor_id IS NOT NULL
                       )
                       OR
                       -- Assigned Logistics Staff
                       u.user_id IN (
                           SELECT s.assigned_logistics_id
                           FROM students s
                           WHERE s.user_id = %s AND s.assigned_logistics_id IS NOT NULL
                       )
                       OR
                       -- All Admins (role_id = 2)
                       u.role_id = 2
                   )
                   ORDER BY u.user_id, r.role_id, u.full_name""",
                (request.user_id, request.user_id),
            )
        else:
            users = []

        return jsonify({"users": [dict(u) for u in users]}), 200

    except Exception as e:
        logger.error(f"Get chat users error: {e}")
        return jsonify({"error": "Failed to get users"}), 500


@app.route("/api/messages", methods=["GET"])
@token_required
def get_messages():
    """Get messages for current user"""
    try:
        messages = db.execute_query(
            """SELECT m.*, 
                      s.full_name as sender_name,
                      r.full_name as receiver_name
               FROM messages m
               JOIN users s ON m.sender_id = s.user_id
               JOIN users r ON m.receiver_id = r.user_id
               WHERE m.sender_id = %s OR m.receiver_id = %s
               ORDER BY m.created_at DESC""",
            (request.user_id, request.user_id),
        )

        return jsonify({"messages": [dict(m) for m in messages]}), 200

    except Exception as e:
        logger.error(f"Get messages error: {e}")
        return jsonify({"error": "Failed to get messages"}), 500


@app.route("/api/messages", methods=["POST"])
@token_required
def send_message():
    """Send message to another user"""
    try:
        data = request.json
        receiver_id = data.get("receiver_id")
        subject = data.get("subject")
        body = data.get("body")

        if not all([receiver_id, subject, body]):
            return jsonify({"error": "All fields required"}), 400

        message = db.execute_one(
            """INSERT INTO messages (sender_id, receiver_id, subject, body)
               VALUES (%s, %s, %s, %s)
               RETURNING message_id, created_at""",
            (request.user_id, receiver_id, subject, body),
        )

        # Create notification for receiver
        db.execute_query(
            """INSERT INTO notifications (user_id, title, message, triggered_by)
               VALUES (%s, %s, %s, %s)""",
            (
                receiver_id,
                "New Message",
                f"You have a new message: {subject}",
                request.user_id,
            ),
            fetch=False,
        )

        return (
            jsonify({"message": "Message sent", "message_id": message["message_id"]}),
            201,
        )

    except Exception as e:
        logger.error(f"Send message error: {e}")
        return jsonify({"error": "Failed to send message"}), 500


@app.route("/api/messages/<int:message_id>/read", methods=["PUT"])
@token_required
def mark_message_read(message_id):
    """Mark message as read"""
    try:
        db.execute_query(
            """UPDATE messages SET is_read = TRUE 
               WHERE message_id = %s AND receiver_id = %s""",
            (message_id, request.user_id),
            fetch=False,
        )

        return jsonify({"message": "Message marked as read"}), 200

    except Exception as e:
        logger.error(f"Mark message read error: {e}")
        return jsonify({"error": "Failed to update message"}), 500


# ==================== NOTIFICATION ROUTES ====================


@app.route("/api/notifications", methods=["GET"])
@token_required
def get_notifications():
    """Get notifications for current user"""
    try:
        notifications = db.execute_query(
            """SELECT n.*, u.full_name as triggered_by_name
               FROM notifications n
               LEFT JOIN users u ON n.triggered_by = u.user_id
               WHERE n.user_id = %s
               ORDER BY n.created_at DESC
               LIMIT 50""",
            (request.user_id,),
        )

        return jsonify({"notifications": [dict(n) for n in notifications]}), 200

    except Exception as e:
        logger.error(f"Get notifications error: {e}")
        return jsonify({"error": "Failed to get notifications"}), 500


@app.route("/api/notifications/<int:notification_id>/read", methods=["PUT"])
@token_required
def mark_notification_read(notification_id):
    """Mark notification as read"""
    try:
        db.execute_query(
            """UPDATE notifications SET status = 'read' 
               WHERE notification_id = %s AND user_id = %s""",
            (notification_id, request.user_id),
            fetch=False,
        )

        return jsonify({"message": "Notification marked as read"}), 200

    except Exception as e:
        logger.error(f"Mark notification read error: {e}")
        return jsonify({"error": "Failed to update notification"}), 500


@app.route("/api/notifications/mark-all-read", methods=["PUT"])
@token_required
def mark_all_notifications_read():
    """Mark all notifications as read for current user"""
    try:
        result = db.execute_query(
            """UPDATE notifications SET status = 'read' 
               WHERE user_id = %s AND status = 'unread'""",
            (request.user_id,),
            fetch=False,
        )

        # Get count of updated notifications
        count = db.execute_one(
            """SELECT COUNT(*) as count FROM notifications 
               WHERE user_id = %s AND status = 'read'""",
            (request.user_id,),
        )

        logger.info(f"User {request.user_id} marked all notifications as read")

        return (
            jsonify(
                {
                    "message": "All notifications marked as read",
                    "count": count["count"] if count else 0,
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Mark all notifications read error: {e}")
        return jsonify({"error": "Failed to mark all notifications as read"}), 500


@app.route("/api/notifications", methods=["POST"])
@token_required
@role_required(1, 2, 3)  # Admin, SuperAdmin, Counsellor can send notifications
def create_notification():
    try:
        data = request.json
        user_id = data.get("user_id")
        title = data.get("title")
        message = data.get("message")

        if not all([user_id, title, message]):
            return jsonify({"error": "user_id, title and message are required"}), 400

        db.execute_query(
            """INSERT INTO notifications (user_id, title, message, triggered_by)
               VALUES (%s, %s, %s, %s)""",
            (user_id, title, message, request.user_id),
            fetch=False,
        )

        # Log action
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address)
               VALUES (%s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Create Notification",
                "notifications",
                None,
                get_client_ip(request),
            ),
            fetch=False,
        )

        return jsonify({"message": "Notification created"}), 201

    except Exception as e:
        logger.error(f"Create notification error: {e}")
        return jsonify({"error": "Failed to create notification"}), 500


# ==================== LOGISTICS ROUTES ====================


@app.route("/api/logistics", methods=["GET"])
@token_required
@role_required(1, 2, 3, 5)  # Admin, Counsellor, or Logistics Staff
def get_logistics():
    """Get logistics records"""
    try:
        # Counsellors and Logistics staff can only see their assigned students
        if request.role_id == 3:  # Counsellor
            logistics = db.execute_query(
                """SELECT l.*, s.student_id, u.full_name as student_name, s.phone
                   FROM logistics l
                   JOIN students s ON l.student_id = s.student_id
                   JOIN users u ON s.user_id = u.user_id
                   WHERE s.assigned_counsellor_id = %s
                   ORDER BY l.pickup_date DESC""",
                (request.user_id,),
            )
        elif request.role_id == 5:  # Logistics Staff
            logistics = db.execute_query(
                """SELECT l.*, s.student_id, u.full_name as student_name, s.phone
                   FROM logistics l
                   JOIN students s ON l.student_id = s.student_id
                   JOIN users u ON s.user_id = u.user_id
                   WHERE s.assigned_logistics_id = %s
                   ORDER BY l.pickup_date DESC""",
                (request.user_id,),
            )
        else:  # Admin and SuperAdmin can see all logistics records
            logistics = db.execute_query(
                """SELECT l.*, s.student_id, u.full_name as student_name, s.phone
                   FROM logistics l
                   JOIN students s ON l.student_id = s.student_id
                   JOIN users u ON s.user_id = u.user_id
                   ORDER BY l.pickup_date DESC"""
            )

        # Convert time and date objects to strings for JSON serialization
        result = []
        for record in logistics:
            record_dict = dict(record)
            if record_dict.get("pickup_time"):
                record_dict["pickup_time"] = record_dict["pickup_time"].strftime(
                    "%H:%M"
                )
            if record_dict.get("arrival_date"):
                record_dict["arrival_date"] = record_dict["arrival_date"].strftime(
                    "%Y-%m-%d"
                )
            if record_dict.get("pickup_date"):
                record_dict["pickup_date"] = record_dict["pickup_date"].strftime(
                    "%Y-%m-%d"
                )
            if record_dict.get("medical_check_date"):
                record_dict["medical_check_date"] = record_dict[
                    "medical_check_date"
                ].strftime("%Y-%m-%d")
            result.append(record_dict)

        return jsonify({"logistics": result}), 200

    except Exception as e:
        logger.error(f"Get logistics error: {e}")
        return jsonify({"error": "Failed to get logistics"}), 500


@app.route("/api/logistics", methods=["POST"])
@token_required
@role_required(1, 2, 5)  # Admin or Logistics Staff
def create_logistics():
    """Create logistics record"""
    try:
        data = request.json

        logistics = db.execute_one(
            """INSERT INTO logistics (student_id, pickup_date, pickup_time, pickup_location, 
                                      accommodation, medical_check_date, arrival_date, 
                                      flight_details, updated_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING logistics_id""",
            (
                data.get("student_id"),
                data.get("pickup_date"),
                data.get("pickup_time"),
                data.get("pickup_location"),
                data.get("accommodation"),
                data.get("medical_check_date"),
                data.get("arrival_date"),
                data.get("flight_details"),
                request.user_id,
            ),
        )

        # Notify student
        student = db.execute_one(
            "SELECT user_id FROM students WHERE student_id = %s",
            (data.get("student_id"),),
        )
        if student:
            db.execute_query(
                """INSERT INTO notifications (user_id, title, message, triggered_by)
                   VALUES (%s, %s, %s, %s)""",
                (
                    student["user_id"],
                    "Logistics Arranged",
                    "Your arrival logistics have been arranged. Check your dashboard for details.",
                    request.user_id,
                ),
                fetch=False,
            )

        return (
            jsonify(
                {
                    "message": "Logistics record created",
                    "logistics_id": logistics["logistics_id"],
                }
            ),
            201,
        )

    except Exception as e:
        logger.error(f"Create logistics error: {e}")
        return jsonify({"error": "Failed to create logistics"}), 500


@app.route("/api/logistics/<int:logistics_id>", methods=["PUT"])
@token_required
@role_required(1, 2, 5, 6)  # Admin, Logistics Staff, or Student
def update_logistics(logistics_id):
    """Update logistics record"""
    try:
        data = request.json

        # Get current logistics record
        current_logistics = db.execute_one(
            """SELECT l.*, s.assigned_logistics_id, s.user_id as student_user_id
               FROM logistics l
               JOIN students s ON l.student_id = s.student_id
               WHERE l.logistics_id = %s""",
            (logistics_id,),
        )

        if not current_logistics:
            return jsonify({"error": "Logistics record not found"}), 404

        # Students can only update their own logistics records
        if request.role_id == 6:  # Student
            if current_logistics["student_user_id"] != request.user_id:
                return (
                    jsonify(
                        {
                            "error": "Access denied. You can only update your own logistics information."
                        }
                    ),
                    403,
                )

            # Students can only edit when status is Pending
            if current_logistics["arrival_status"] != "Pending":
                return (
                    jsonify(
                        {
                            "error": "You cannot edit logistics information once the process has started. Status must be Pending."
                        }
                    ),
                    403,
                )

            # Students cannot update arrival_status
            if "arrival_status" in data:
                return jsonify({"error": "Students cannot update arrival status"}), 403

        # Logistics staff can only update their assigned students' records
        if request.role_id == 5:  # Logistics Staff
            if current_logistics["assigned_logistics_id"] != request.user_id:
                return (
                    jsonify(
                        {
                            "error": "Access denied. You can only update records of your assigned students."
                        }
                    ),
                    403,
                )

            # Logistics staff can only update status
            if "arrival_status" not in data or len(data) > 1:
                return (
                    jsonify(
                        {"error": "Logistics staff can only update arrival status"}
                    ),
                    403,
                )

        # Build update query dynamically
        update_fields = []
        params = []

        # Valid statuses
        valid_statuses = [
            "Pending",
            "Arrived",
            "Accommodation",
            "Medical Check Process",
            "Completed",
        ]

        if "arrival_status" in data:
            if data["arrival_status"] not in valid_statuses:
                return (
                    jsonify(
                        {
                            "error": "Invalid status. Valid statuses: Pending, Arrived, Accommodation, Medical Check Process, Completed"
                        }
                    ),
                    400,
                )
            update_fields.append("arrival_status = %s")
            params.append(data["arrival_status"])

        # Admin/SuperAdmin can update all fields
        if request.role_id in [1, 2, 6]:  # Admin, SuperAdmin, or Student
            if "pickup_date" in data:
                update_fields.append("pickup_date = %s")
                params.append(data["pickup_date"] if data["pickup_date"] else None)

            if "pickup_time" in data:
                update_fields.append("pickup_time = %s")
                params.append(data["pickup_time"] if data["pickup_time"] else None)

            if "pickup_location" in data:
                update_fields.append("pickup_location = %s")
                params.append(
                    data["pickup_location"] if data["pickup_location"] else None
                )

            if "accommodation" in data:
                update_fields.append("accommodation = %s")
                params.append(data["accommodation"] if data["accommodation"] else None)

            if "medical_check_date" in data:
                update_fields.append("medical_check_date = %s")
                params.append(
                    data["medical_check_date"] if data["medical_check_date"] else None
                )

            if "arrival_date" in data:
                update_fields.append("arrival_date = %s")
                params.append(data["arrival_date"] if data["arrival_date"] else None)

            if "flight_details" in data:
                update_fields.append("flight_details = %s")
                params.append(
                    data["flight_details"] if data["flight_details"] else None
                )

        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400

        update_fields.append("updated_by = %s")
        params.append(request.user_id)
        update_fields.append("updated_at = NOW()")

        params.append(logistics_id)

        # Update logistics
        db.execute_query(
            f"UPDATE logistics SET {', '.join(update_fields)} WHERE logistics_id = %s",
            tuple(params),
            fetch=False,
        )

        # Get logistics and student info for audit
        logistics_info = db.execute_one(
            """SELECT l.*, u.full_name as student_name
               FROM logistics l
               JOIN students s ON l.student_id = s.student_id
               JOIN users u ON s.user_id = u.user_id
               WHERE l.logistics_id = %s""",
            (logistics_id,),
        )

        # Log action with details
        changed_fields = ", ".join(
            [
                field.split(" = ")[0]
                for field in update_fields
                if "updated_" not in field
            ]
        )
        audit_details = f'Logistics ID: {logistics_id}, Updated Fields: {changed_fields}, Student: {logistics_info["student_name"] if logistics_info else "N/A"}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Update Logistics",
                "logistics",
                logistics_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        return jsonify({"message": "Logistics updated successfully"}), 200

    except Exception as e:
        logger.error(f"Update logistics error: {e}")
        return jsonify({"error": "Failed to update logistics"}), 500


@app.route("/api/logistics/<int:logistics_id>/delete", methods=["DELETE"])
@token_required
@role_required(1, 2)  # SuperAdmin and Admin only
def delete_logistics(logistics_id):
    """Delete logistics record (Admin and SuperAdmin only)"""
    try:
        # Get logistics details for audit trail
        logistics = db.execute_one(
            """SELECT l.logistics_id, l.arrival_status, l.pickup_date, l.pickup_location,
                      u.full_name as student_name
               FROM logistics l
               JOIN students s ON l.student_id = s.student_id
               JOIN users u ON s.user_id = u.user_id
               WHERE l.logistics_id = %s""",
            (logistics_id,),
        )

        if not logistics:
            return jsonify({"error": "Logistics record not found"}), 404

        # Log action BEFORE deletion for audit trail
        audit_details = f'DELETED Logistics - ID: {logistics_id}, Student: {logistics["student_name"]}, Status: {logistics["arrival_status"]}, Pickup Date: {logistics["pickup_date"]}, Location: {logistics["pickup_location"]}'
        db.execute_query(
            """INSERT INTO audit_logs (user_id, action, target_table, target_id, ip_address, details)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                request.user_id,
                "Delete Logistics Record",
                "logistics",
                logistics_id,
                get_client_ip(request),
                audit_details,
            ),
            fetch=False,
        )

        # Delete the logistics record
        db.execute_query(
            "DELETE FROM logistics WHERE logistics_id = %s",
            (logistics_id,),
            fetch=False,
        )

        return jsonify({"message": "Logistics record deleted successfully"}), 200

    except Exception as e:
        logger.error(f"Delete logistics error: {e}")
        return jsonify({"error": f"Failed to delete logistics record: {str(e)}"}), 500


# ==================== AUDIT LOG ROUTES ====================


@app.route("/api/audit-logs", methods=["GET"])
@token_required
@role_required(1, 2)  # Manager, Admin only
def get_audit_logs():
    """Get audit logs (Admin only)"""
    try:
        limit = request.args.get("limit", 100, type=int)

        logs_raw = db.execute_query(
            """SELECT a.*, u.full_name, u.email
               FROM audit_logs a
               LEFT JOIN users u ON a.user_id = u.user_id
               ORDER BY a.timestamp DESC
               LIMIT %s""",
            (limit,),
        )

        if logs_raw is None:
            return jsonify({"logs": []}), 200

        # Process logs with proper type conversion
        logs = []
        for log in logs_raw:
            try:
                # Convert to regular dict and handle all non-JSON-serializable types
                log_dict = {}

                for key, value in log.items():
                    if value is None:
                        log_dict[key] = None
                    elif hasattr(value, "isoformat"):  # datetime, date, time objects
                        log_dict[key] = value.isoformat()
                    elif hasattr(value, "__str__") and type(value).__name__ in (
                        "IPv4Address",
                        "IPv6Address",
                        "IPv4Network",
                        "IPv6Network",
                    ):
                        # Convert IP address types to strings
                        log_dict[key] = str(value)
                    else:
                        log_dict[key] = value

                # If details field is empty or None, try to fetch target name
                if (
                    not log_dict.get("details")
                    and log_dict.get("target_table")
                    and log_dict.get("target_id")
                ):
                    target_name = "N/A"

                    try:
                        if log_dict["target_table"] == "students":
                            student = db.execute_one(
                                """SELECT u.full_name FROM students s 
                                   JOIN users u ON s.user_id = u.user_id 
                                   WHERE s.student_id = %s""",
                                (log_dict["target_id"],),
                            )
                            target_name = student["full_name"] if student else "N/A"

                        elif log_dict["target_table"] == "users":
                            user = db.execute_one(
                                "SELECT full_name FROM users WHERE user_id = %s",
                                (log_dict["target_id"],),
                            )
                            target_name = user["full_name"] if user else "N/A"

                        elif log_dict["target_table"] == "applications":
                            app = db.execute_one(
                                """SELECT u.full_name FROM applications a
                                   JOIN students s ON a.student_id = s.student_id
                                   JOIN users u ON s.user_id = u.user_id
                                   WHERE a.application_id = %s""",
                                (log_dict["target_id"],),
                            )
                            target_name = app["full_name"] if app else "N/A"

                        elif log_dict["target_table"] == "documents":
                            doc = db.execute_one(
                                """SELECT u.full_name FROM documents d
                                   JOIN students s ON d.student_id = s.student_id
                                   JOIN users u ON s.user_id = u.user_id
                                   WHERE d.document_id = %s""",
                                (log_dict["target_id"],),
                            )
                            target_name = doc["full_name"] if doc else "N/A"

                        elif log_dict["target_table"] == "logistics":
                            logistic = db.execute_one(
                                """SELECT u.full_name FROM logistics l
                                   JOIN students s ON l.student_id = s.student_id
                                   JOIN users u ON s.user_id = u.user_id
                                   WHERE l.logistics_id = %s""",
                                (log_dict["target_id"],),
                            )
                            target_name = logistic["full_name"] if logistic else "N/A"

                    except Exception as detail_error:
                        logger.warning(
                            f"Could not fetch target details: {detail_error}"
                        )
                        target_name = "N/A"

                    # Add enhanced details
                    log_dict["details"] = (
                        f"Target: {log_dict['target_table']} (ID: {log_dict['target_id']}, Name: {target_name})"
                    )

                logs.append(log_dict)

            except Exception as row_error:
                logger.warning(f"Could not process audit log row: {row_error}")
                continue

        return jsonify({"logs": logs}), 200

    except Exception as e:
        logger.error(f"Get audit logs error: {e}", exc_info=True)
        return jsonify({"error": f"Failed to get audit logs: {str(e)}"}), 500


# ==================== SOCKET.IO EVENTS (Real-Time Chat) ====================


@socketio.on("connect")
def handle_connect():
    """Handle client connection"""
    logger.info(f"Client connected: {request.sid}")


@socketio.on("disconnect")
def handle_disconnect():
    """Handle client disconnection"""
    # Remove user from connected users
    user_id_to_remove = None
    for user_id, sid in connected_users.items():
        if sid == request.sid:
            user_id_to_remove = user_id
            break

    if user_id_to_remove:
        del connected_users[user_id_to_remove]
        logger.info(f"User {user_id_to_remove} disconnected")


@socketio.on("authenticate")
def handle_authenticate(data):
    """Authenticate user for WebSocket connection"""
    try:
        token = data.get("token")
        if not token:
            emit("error", {"message": "No token provided"})
            return

        # Verify JWT token
        payload = auth_service.verify_token(token)
        if not payload:
            emit("error", {"message": "Invalid token"})
            return

        user_id = payload["user_id"]
        connected_users[user_id] = request.sid

        # Join user's personal room
        join_room(f"user_{user_id}")

        logger.info(f"User {user_id} authenticated for WebSocket")
        emit("authenticated", {"user_id": user_id, "status": "connected"})

        # Notify about online status
        emit("user_online", {"user_id": user_id}, broadcast=True)

    except Exception as e:
        logger.error(f"Authentication error: {e}")
        emit("error", {"message": "Authentication failed"})


@socketio.on("send_message")
def handle_send_message(data):
    """Handle real-time message sending"""
    try:
        receiver_id = data.get("receiver_id")
        body = data.get("body")
        sender_id = data.get("sender_id")

        if not all([receiver_id, body, sender_id]):
            emit("error", {"message": "Missing required fields"})
            return

        # Save message to database
        message = db.execute_one(
            """INSERT INTO messages (sender_id, receiver_id, subject, body)
               VALUES (%s, %s, %s, %s)
               RETURNING message_id, created_at""",
            (sender_id, receiver_id, "Chat", body),
        )

        # Get sender info
        sender = db.execute_one(
            "SELECT full_name, email FROM users WHERE user_id = %s", (sender_id,)
        )

        # Prepare message data
        message_data = {
            "message_id": message["message_id"],
            "sender_id": sender_id,
            "sender_name": sender["full_name"],
            "sender_email": sender["email"],
            "receiver_id": receiver_id,
            "body": body,
            "created_at": message["created_at"].isoformat(),
            "is_read": False,
        }

        # Send to sender (confirmation)
        emit("message_sent", message_data, room=request.sid)

        # Send to receiver if online
        if receiver_id in connected_users:
            receiver_sid = connected_users[receiver_id]
            emit("new_message", message_data, room=receiver_sid)

        # Create notification for receiver
        db.execute_query(
            """INSERT INTO notifications (user_id, title, message, triggered_by)
               VALUES (%s, %s, %s, %s)""",
            (
                receiver_id,
                "New Message",
                f'{sender["full_name"]} sent you a message',
                sender_id,
            ),
            fetch=False,
        )

        logger.info(f"Message from {sender_id} to {receiver_id} delivered")

    except Exception as e:
        logger.error(f"Send message error: {e}")
        emit("error", {"message": "Failed to send message"})


@socketio.on("typing")
def handle_typing(data):
    """Handle typing indicator"""
    try:
        receiver_id = data.get("receiver_id")
        sender_id = data.get("sender_id")
        is_typing = data.get("is_typing", True)

        if receiver_id in connected_users:
            receiver_sid = connected_users[receiver_id]
            emit(
                "user_typing",
                {"user_id": sender_id, "is_typing": is_typing},
                room=receiver_sid,
            )

    except Exception as e:
        logger.error(f"Typing indicator error: {e}")


@socketio.on("mark_read")
def handle_mark_read(data):
    """Mark messages as read in real-time"""
    try:
        sender_id = data.get("sender_id")
        receiver_id = data.get("receiver_id")  # Current user

        # Mark all messages from sender as read
        db.execute_query(
            """UPDATE messages SET is_read = TRUE 
               WHERE sender_id = %s AND receiver_id = %s AND is_read = FALSE""",
            (sender_id, receiver_id),
            fetch=False,
        )

        # Notify sender that messages were read
        if sender_id in connected_users:
            sender_sid = connected_users[sender_id]
            emit("messages_read", {"reader_id": receiver_id}, room=sender_sid)

    except Exception as e:
        logger.error(f"Mark read error: {e}")


# ==================== ANALYTICS ROUTES ====================


@app.route("/api/analytics/admin", methods=["GET"])
@token_required
@role_required(1, 2)  # Manager, Admin only
def get_admin_analytics():
    """Get analytics data for admin dashboard"""
    try:
        # Students without counsellors
        students_no_counsellor = db.execute_one(
            "SELECT COUNT(*) as count FROM students WHERE assigned_counsellor_id IS NULL"
        )

        # Students without logistics
        students_no_logistics = db.execute_one(
            "SELECT COUNT(*) as count FROM students WHERE assigned_logistics_id IS NULL"
        )

        # Application status breakdown
        app_status = db.execute_query(
            """SELECT status, COUNT(*) as count 
               FROM applications 
               GROUP BY status 
               ORDER BY count DESC"""
        )

        # Document verification status
        doc_status = db.execute_query(
            """SELECT 
                CASE 
                    WHEN verified IS NULL THEN 'Pending'
                    WHEN verified = TRUE THEN 'Verified'
                    WHEN verified = FALSE THEN 'Rejected'
                END as status,
                COUNT(*) as count 
               FROM documents 
               GROUP BY verified"""
        )

        # Total counts
        total_students = db.execute_one("SELECT COUNT(*) as count FROM students")
        total_applications = db.execute_one(
            "SELECT COUNT(*) as count FROM applications"
        )
        total_counsellors = db.execute_one(
            "SELECT COUNT(*) as count FROM users WHERE role_id = 3 AND is_active = TRUE"
        )
        total_users = db.execute_one(
            "SELECT COUNT(*) as count FROM users WHERE is_active = TRUE"
        )

        # Applications by university (top 10)
        apps_by_university = db.execute_query(
            """SELECT u.name as university_name, COUNT(*) as count 
               FROM applications a
               JOIN universities u ON a.university_id = u.university_id
               GROUP BY u.name 
               ORDER BY count DESC 
               LIMIT 10"""
        )

        # Recent activity (last 7 days)
        recent_registrations = db.execute_one(
            """SELECT COUNT(*) as count FROM users 
               WHERE created_at >= NOW() - INTERVAL '7 days'"""
        )

        # Counsellor workload (students per counsellor)
        counsellor_workload = db.execute_query(
            """SELECT u.full_name, COUNT(s.student_id) as student_count
               FROM users u
               LEFT JOIN students s ON u.user_id = s.assigned_counsellor_id
               WHERE u.role_id = 3 AND u.is_active = TRUE
               GROUP BY u.user_id, u.full_name
               ORDER BY student_count DESC"""
        )

        # Audit logs activity (last 30 days by action type)
        audit_activity = db.execute_query(
            """SELECT action, COUNT(*) as count
               FROM audit_logs
               WHERE timestamp >= NOW() - INTERVAL '30 days'
               GROUP BY action
               ORDER BY count DESC
               LIMIT 10"""
        )

        # User registrations by role
        users_by_role = db.execute_query(
            """SELECT r.role_name, COUNT(u.user_id) as count
               FROM users u
               JOIN roles r ON u.role_id = r.role_id
               WHERE u.is_active = TRUE
               GROUP BY r.role_name
               ORDER BY count DESC"""
        )

        # Active vs Inactive users
        user_status = db.execute_query(
            """SELECT 
                CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END as status,
                COUNT(*) as count
               FROM users
               GROUP BY is_active"""
        )

        # Recent audit activity by user (top 10 most active)
        top_active_users = db.execute_query(
            """SELECT u.full_name, r.role_name, COUNT(a.log_id) as action_count
               FROM audit_logs a
               JOIN users u ON a.user_id = u.user_id
               JOIN roles r ON u.role_id = r.role_id
               WHERE a.timestamp >= NOW() - INTERVAL '7 days'
               GROUP BY u.user_id, u.full_name, r.role_name
               ORDER BY action_count DESC
               LIMIT 10"""
        )

        # Application decisions breakdown
        decision_breakdown = db.execute_query(
            """SELECT decision_type, COUNT(*) as count
               FROM applications
               WHERE decision_type IS NOT NULL
               GROUP BY decision_type"""
        )

        return (
            jsonify(
                {
                    "students_no_counsellor": students_no_counsellor["count"],
                    "students_no_logistics": students_no_logistics["count"],
                    "application_status": [dict(s) for s in app_status],
                    "document_status": [dict(d) for d in doc_status],
                    "total_students": total_students["count"],
                    "total_applications": total_applications["count"],
                    "total_counsellors": total_counsellors["count"],
                    "total_users": total_users["count"],
                    "apps_by_university": [dict(a) for a in apps_by_university],
                    "recent_registrations": recent_registrations["count"],
                    "counsellor_workload": [dict(c) for c in counsellor_workload],
                    "audit_activity": [dict(a) for a in audit_activity],
                    "users_by_role": [dict(u) for u in users_by_role],
                    "user_status": [dict(s) for s in user_status],
                    "top_active_users": [dict(u) for u in top_active_users],
                    "decision_breakdown": [dict(d) for d in decision_breakdown],
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Get admin analytics error: {e}")
        import traceback

        traceback.print_exc()
        return jsonify({"error": f"Failed to get analytics: {str(e)}"}), 500


@app.route("/api/analytics/counsellor", methods=["GET"])
@token_required
@role_required(3)  # Counsellor only
def get_counsellor_analytics():
    """Get analytics data for counsellor dashboard"""
    try:
        user_id = request.user_id

        # My students count
        my_students = db.execute_one(
            "SELECT COUNT(*) as count FROM students WHERE assigned_counsellor_id = %s",
            (user_id,),
        )

        # Students by application status
        students_by_status = db.execute_query(
            """SELECT s.application_status, COUNT(*) as count
               FROM students s
               WHERE s.assigned_counsellor_id = %s
               GROUP BY s.application_status""",
            (user_id,),
        )

        # My applications breakdown
        my_applications = db.execute_query(
            """SELECT a.status, COUNT(*) as count
               FROM applications a
               JOIN students s ON a.student_id = s.student_id
               WHERE s.assigned_counsellor_id = %s
               GROUP BY a.status""",
            (user_id,),
        )

        # Document verification progress
        doc_progress = db.execute_query(
            """SELECT 
                CASE 
                    WHEN d.verified IS NULL THEN 'Pending'
                    WHEN d.verified = TRUE THEN 'Verified'
                    WHEN d.verified = FALSE THEN 'Rejected'
                END as status,
                COUNT(*) as count
               FROM documents d
               JOIN students s ON d.student_id = s.student_id
               WHERE s.assigned_counsellor_id = %s
               GROUP BY d.verified""",
            (user_id,),
        )

        # Students needing attention (no applications yet)
        students_no_apps = db.execute_one(
            """SELECT COUNT(DISTINCT s.student_id) as count
               FROM students s
               LEFT JOIN applications a ON s.student_id = a.student_id
               WHERE s.assigned_counsellor_id = %s AND a.application_id IS NULL""",
            (user_id,),
        )

        # Recent applications (last 7 days)
        recent_apps = db.execute_one(
            """SELECT COUNT(*) as count
               FROM applications a
               JOIN students s ON a.student_id = s.student_id
               WHERE s.assigned_counsellor_id = %s 
               AND a.created_at >= NOW() - INTERVAL '7 days'""",
            (user_id,),
        )

        return (
            jsonify(
                {
                    "total_students": my_students["count"],
                    "students_by_status": [dict(s) for s in students_by_status],
                    "applications_by_status": [dict(a) for a in my_applications],
                    "document_progress": [dict(d) for d in doc_progress],
                    "students_no_apps": students_no_apps["count"],
                    "recent_applications": recent_apps["count"],
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Get counsellor analytics error: {e}")
        import traceback

        traceback.print_exc()
        return jsonify({"error": f"Failed to get analytics: {str(e)}"}), 500


# ==================== ROLE ROUTES ====================


@app.route("/api/roles", methods=["GET"])
@token_required
def get_roles():
    """Get all roles"""
    try:
        roles = db.execute_query(
            "SELECT role_id, role_name, permissions FROM roles ORDER BY role_id"
        )
        return jsonify({"roles": [dict(r) for r in roles]}), 200

    except Exception as e:
        logger.error(f"Get roles error: {e}")
        return jsonify({"error": "Failed to get roles"}), 500


# ==================== ERROR HANDLERS ====================


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Endpoint not found"}), 404
    return render_template("404.html"), 404


@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal server error: {e}")
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error"}), 500
    return render_template("500.html"), 500


# ==================== MAIN ====================

if __name__ == "__main__":
    try:
        # Test database connection
        db.connect()
        logger.info("Database connected successfully")

        # Detect the local IP address
        local_ip = get_local_ip()
        host = local_ip if local_ip != "127.0.0.1" else "0.0.0.0"
        port = Config.PORT

        # Print network information
        print_network_info(host, port)

        # Run Flask app with SocketIO on detected IP
        socketio.run(
            app,
            host="0.0.0.0",  # Listen on all interfaces
            port=port,
            debug=Config.DEBUG,
            allow_unsafe_werkzeug=True,
        )
    except Exception as e:
        logger.error(f"Failed to start application: {e}")
    finally:
        db.close()
