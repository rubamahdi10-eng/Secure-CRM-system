import jwt
from datetime import datetime, timedelta
from config import Config
import hashlib
from functools import wraps
from flask import request, jsonify


class AuthService:
    """JWT-based authentication service"""

    @staticmethod
    def hash_password(password):
        """Hash password using SHA-256"""
        return hashlib.sha256(password.encode()).hexdigest()

    @staticmethod
    def verify_password(password, password_hash):
        """Verify password against SHA-256 hash"""
        hashed_input = hashlib.sha256(password.encode()).hexdigest()
        return hashed_input == password_hash

    @staticmethod
    def generate_token(user_id, role_id):
        """Generate JWT token"""
        payload = {
            "user_id": user_id,
            "role_id": role_id,
            "exp": datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
            "iat": datetime.utcnow(),
        }

        token = jwt.encode(
            payload, Config.JWT_SECRET_KEY, algorithm=Config.JWT_ALGORITHM
        )

        return token

    @staticmethod
    def verify_token(token):
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(
                token, Config.JWT_SECRET_KEY, algorithms=[Config.JWT_ALGORITHM]
            )
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None


def token_required(f):
    """Decorator to protect routes with JWT authentication"""

    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Get token from Authorization header
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            try:
                token = auth_header.split(" ")[1]  # Bearer <token>
            except IndexError:
                return jsonify({"error": "Invalid token format"}), 401

        if not token:
            return jsonify({"error": "Token is missing"}), 401

        # Verify token
        payload = AuthService.verify_token(token)
        if not payload:
            return jsonify({"error": "Token is invalid or expired"}), 401

        # Add user info to request
        request.user_id = payload["user_id"]
        request.role_id = payload["role_id"]

        return f(*args, **kwargs)

    return decorated


def role_required(*allowed_roles):
    """Decorator to check user role"""

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(request, "role_id"):
                return jsonify({"error": "Authentication required"}), 401

            if request.role_id not in allowed_roles:
                return jsonify({"error": "Insufficient permissions"}), 403

            return f(*args, **kwargs)

        return decorated

    return decorator


# Global auth service instance
auth_service = AuthService()
