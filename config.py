import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Database
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://ruba_user_user:QjdycF5qnTzplwGuDXHdNNtmuK0ZuI2m@dpg-d4gmvaumcj7s73bhat9g-a.singapore-postgres.render.com/ruba_user",
    )

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 24))

    # Encryption
    AES_MASTER_KEY = os.getenv("AES_MASTER_KEY")

    # Email
    SMTP_HOST = os.getenv("SMTP_HOST")
    SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
    SMTP_USER = os.getenv("SMTP_USER")
    SMTP_PASS = os.getenv("SMTP_PASS")
    FROM_EMAIL = os.getenv("FROM_EMAIL")
    FROM_NAME = os.getenv("FROM_NAME", "YourUni Team")

    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY")
    DEBUG = os.getenv("DEBUG", "False") == "True"
    HOST = os.getenv("APP_HOST", "0.0.0.0")
    PORT = int(os.getenv("APP_PORT", 5000))

    # Domain
    DOMAIN_NAME = os.getenv("DOMAIN_NAME", "localhost:5000")
