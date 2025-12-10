import psycopg
from psycopg.rows import dict_row
from config import Config
import logging

logger = logging.getLogger(__name__)


class Database:
    def __init__(self):
        self.connection = None

    def connect(self):
        """Establish database connection"""
        try:
            # Use row_factory=dict_row to mimic RealDictCursor
            self.connection = psycopg.connect(Config.DATABASE_URL, row_factory=dict_row)
            logger.info("Database connection established")
            return self.connection
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise

    def get_connection(self):
        """Get existing connection or create new one"""
        if self.connection is None or self.connection.closed:
            self.connect()
        return self.connection

    def execute_query(self, query, params=None, fetch=True):
        """Execute a query and return results"""
        conn = self.get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                if fetch:
                    return cursor.fetchall()
                conn.commit()
                return cursor.rowcount
        except Exception as e:
            conn.rollback()
            logger.error(f"Query execution failed: {e}")
            raise

    def execute_one(self, query, params=None):
        """Execute a query and return single result"""
        conn = self.get_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                return cursor.fetchone()
        except Exception as e:
            conn.rollback()
            logger.error(f"Query execution failed: {e}")
            raise

    def close(self):
        """Close database connection"""
        if self.connection and not self.connection.closed:
            self.connection.close()
            logger.info("Database connection closed")


# Global database instance
db = Database()
