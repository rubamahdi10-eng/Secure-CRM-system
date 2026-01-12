from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os
import base64
from config import Config


class EncryptionService:
    """AES-256-GCM encryption service for document security"""

    def __init__(self):
        # Convert hex key to bytes
        key_bytes = bytes.fromhex(Config.AES_MASTER_KEY)
        
        # AES-GCM requires key length of 16, 24, or 32 bytes (128, 192, or 256 bits)
        # Ensure key is 32 bytes (256 bits) for AES-256
        if len(key_bytes) < 32:
            # Pad key if necessary (should not happen with proper config)
            key_bytes = key_bytes.ljust(32, b'\x00')
        elif len(key_bytes) > 32:
            # Truncate if too long
            key_bytes = key_bytes[:32]
        
        self.master_key = key_bytes

    def encrypt_document(self, data):
        """
        Encrypt document data using AES-256-GCM
        Returns: (encrypted_data_base64, iv_base64)
        Note: For GCM, nonce is prepended to ciphertext in encrypted_data_base64
        The iv_base64 is returned as "GCM" placeholder for API compatibility
        """
        try:
            # Create AES-GCM cipher
            aesgcm = AESGCM(self.master_key)
            
            # Generate random nonce (12 bytes recommended for GCM)
            nonce = os.urandom(12)
            
            # Convert data to bytes if needed
            if isinstance(data, str):
                data = data.encode("utf-8")
            
            # Encrypt: nonce is prepended to ciphertext by GCM
            ciphertext = aesgcm.encrypt(nonce, data, None)
            
            # Combine nonce + ciphertext
            encrypted_data = nonce + ciphertext
            
            # Return base64 encoded strings for storage
            # Store nonce+ciphertext in encrypted_blob, placeholder in iv for API compatibility
            return (
                base64.b64encode(encrypted_data).decode("utf-8"),
                base64.b64encode(b"GCM").decode("utf-8"),  # Placeholder for API compatibility
            )
        except Exception as e:
            raise Exception(f"Encryption failed: {str(e)}")

    def decrypt_document(self, encrypted_data_b64, iv_b64):
        """
        Decrypt document data using AES-256-GCM
        Returns: decrypted bytes
        Note: For GCM, nonce is extracted from the beginning of encrypted_data
        The iv_b64 parameter is ignored (kept for API compatibility)
        """
        try:
            # Decode base64 string
            encrypted_data = base64.b64decode(encrypted_data_b64)
            
            # Extract nonce (first 12 bytes) and ciphertext (rest)
            nonce = encrypted_data[:12]
            ciphertext = encrypted_data[12:]
            
            # Create AES-GCM cipher
            aesgcm = AESGCM(self.master_key)
            
            # Decrypt
            decrypted_data = aesgcm.decrypt(nonce, ciphertext, None)
            
            return decrypted_data
        except Exception as e:
            raise Exception(f"Decryption failed: {str(e)}")


# Global encryption service instance
encryption_service = EncryptionService()
