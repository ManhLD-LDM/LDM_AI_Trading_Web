import os
import pymongo
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from logger import setup_logger

load_dotenv()

db_logger = setup_logger("ldm.database")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "ldm_trading_db")
CONNECT_TIMEOUT_MS = int(os.getenv("MONGO_TIMEOUT_MS", "10000"))
MAX_RETRIES = int(os.getenv("MONGO_RETRIES", "3"))


class Database:
    client: AsyncIOMotorClient = None


db = Database()


async def connect_to_mongo() -> bool:
    """
    Attempt to connect to MongoDB with retry logic.
    Returns True if connected, False if all attempts failed.
    Backend continues in Mock mode if DB is unavailable.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            db_logger.info(f"Connecting to MongoDB (attempt {attempt}/{MAX_RETRIES})...")
            client = AsyncIOMotorClient(
                MONGO_URI,
                serverSelectionTimeoutMS=CONNECT_TIMEOUT_MS,
                connectTimeoutMS=CONNECT_TIMEOUT_MS,
                socketTimeoutMS=CONNECT_TIMEOUT_MS,
            )
            # Verify connection with ping
            await client.admin.command("ping")
            db.client = client
            db_logger.info("✓ MongoDB connected successfully")

            # Setup TTL Index (30 days)
            database = client[DB_NAME]
            await database["trade_signals"].create_index(
                [("createdAt", pymongo.ASCENDING)],
                expireAfterSeconds=2592000
            )
            db_logger.info("✓ TTL Index verified for trade_signals")
            return True

        except Exception as e:
            db.client = None
            err_type = type(e).__name__
            db_logger.warning(f"MongoDB attempt {attempt}/{MAX_RETRIES} failed [{err_type}]: {e}")

            if "DNS" in str(e) or "getaddrinfo" in str(e) or "ConfigurationError" in str(e):
                db_logger.error(
                    "DNS resolution failed for MongoDB cluster.\n"
                    "Possible causes:\n"
                    "  1. Atlas cluster is PAUSED (free tier pauses after 60 days idle) → Resume at cloud.mongodb.com\n"
                    "  2. Server IP not whitelisted → Atlas > Network Access > Add IP\n"
                    "  3. Wrong connection string → Check Atlas > Connect > Drivers\n"
                    "Backend will run in MOCK MODE (no persistence)."
                )
                break  # DNS errors won't fix themselves with a retry

            if attempt < MAX_RETRIES:
                wait = 2 ** attempt
                db_logger.info(f"Retrying in {wait}s...")
                await asyncio.sleep(wait)

    db_logger.warning("⚠ Running in MOCK MODE — no database persistence")
    return False


async def close_mongo_connection():
    if db.client:
        db.client.close()
        db_logger.info("MongoDB connection closed.")


def get_database():
    if not db.client:
        raise Exception("Database not available (Mock mode — db.client is None)")
    return db.client[DB_NAME]


def is_connected() -> bool:
    """Returns True if MongoDB is currently connected."""
    return db.client is not None
