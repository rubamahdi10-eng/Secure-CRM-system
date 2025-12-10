import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import Config
import logging

logger = logging.getLogger(__name__)


class EmailService:
    """Email notification service using Office365 SMTP"""

    @staticmethod
    def send_email(to_email, subject, body_html, body_text=None):
        """Send email via SMTP"""
        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{Config.FROM_NAME} <{Config.FROM_EMAIL}>"
            msg["To"] = to_email

            # Add text version (fallback)
            if body_text:
                part1 = MIMEText(body_text, "plain")
                msg.attach(part1)

            # Add HTML version
            part2 = MIMEText(body_html, "html")
            msg.attach(part2)

            # Connect to SMTP server
            with smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT) as server:
                server.starttls()
                server.login(Config.SMTP_USER, Config.SMTP_PASS)
                server.send_message(msg)

            logger.info(f"Email sent to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    @staticmethod
    def send_welcome_email(to_email, full_name, role_name):
        """Send welcome email to new user"""
        subject = "Welcome to YourUni System"
        body_html = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2 style="color: #2c3e50;">Welcome to YourUni!</h2>
                <p>Dear {full_name},</p>
                <p>Your account has been successfully created with the role: <strong>{role_name}</strong>.</p>
                <p>You can now log in to the system at: <a href="https://{Config.DOMAIN_NAME}">https://{Config.DOMAIN_NAME}</a></p>
                <p>If you have any questions, please don't hesitate to contact us.</p>
                <br>
                <p>Best regards,<br>The YourUni Team</p>
            </body>
        </html>
        """
        body_text = f"Welcome to YourUni, {full_name}! Your account has been created with role: {role_name}."

        return EmailService.send_email(to_email, subject, body_html, body_text)

    @staticmethod
    def send_application_notification(to_email, student_name, university_name, status):
        """Send application status notification"""
        subject = f"Application Update: {university_name}"
        body_html = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2 style="color: #2c3e50;">Application Status Update</h2>
                <p>Dear {student_name},</p>
                <p>Your application to <strong>{university_name}</strong> has been updated.</p>
                <p>Current Status: <strong style="color: #27ae60;">{status}</strong></p>
                <p>Please log in to your dashboard for more details.</p>
                <br>
                <p>Best regards,<br>The YourUni Team</p>
            </body>
        </html>
        """
        body_text = f"Dear {student_name}, your application to {university_name} status: {status}"

        return EmailService.send_email(to_email, subject, body_html, body_text)

    @staticmethod
    def send_document_request(to_email, student_name, doc_type):
        """Send document request notification"""
        subject = "Document Upload Required"
        body_html = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2 style="color: #2c3e50;">Document Upload Request</h2>
                <p>Dear {student_name},</p>
                <p>Please upload the following document: <strong>{doc_type}</strong></p>
                <p>Log in to your dashboard to upload the required document.</p>
                <br>
                <p>Best regards,<br>The YourUni Team</p>
            </body>
        </html>
        """
        body_text = f"Dear {student_name}, please upload: {doc_type}"

        return EmailService.send_email(to_email, subject, body_html, body_text)


# Global email service instance
email_service = EmailService()
