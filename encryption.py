from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Util.Padding import pad, unpad
import base64
from config import Config


class EncryptionService:
    """AES-256 encryption service for document security"""

    def __init__(self):
        # Convert hex key to bytes
        self.master_key = bytes.fromhex(Config.AES_MASTER_KEY)

    def encrypt_document(self, data):
        """
        Encrypt document data using AES-256-CBC
        Returns: (encrypted_data_base64, iv_base64)
        """
        try:
            # Generate random IV (Initialization Vector)
            iv = get_random_bytes(16)

            # Create cipher
            cipher = AES.new(self.master_key, AES.MODE_CBC, iv)

            # Encrypt data (pad to block size)
            if isinstance(data, str):
                data = data.encode("utf-8")

            encrypted_data = cipher.encrypt(pad(data, AES.block_size))

            # Return base64 encoded strings for storage
            return (
                base64.b64encode(encrypted_data).decode("utf-8"),
                base64.b64encode(iv).decode("utf-8"),
            )
        except Exception as e:
            raise Exception(f"Encryption failed: {str(e)}")

    def decrypt_document(self, encrypted_data_b64, iv_b64):
        """
        Decrypt document data using AES-256-CBC
        Returns: decrypted bytes
        """
        try:
            # Decode base64 strings
            encrypted_data = base64.b64decode(encrypted_data_b64)
            iv = base64.b64decode(iv_b64)

            # Create cipher
            cipher = AES.new(self.master_key, AES.MODE_CBC, iv)

            # Decrypt and unpad
            decrypted_data = unpad(cipher.decrypt(encrypted_data), AES.block_size)

            return decrypted_data
        except Exception as e:
            raise Exception(f"Decryption failed: {str(e)}")


# Global encryption service instance
encryption_service = EncryptionService()
