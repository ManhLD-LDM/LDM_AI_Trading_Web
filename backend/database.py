import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "ldm_trading_db")

class Database:
    client: AsyncIOMotorClient = None

db = Database()

async def connect_to_mongo():
    try:
        db.client = AsyncIOMotorClient(MONGO_URI)
        # Verify connection
        await db.client.admin.command('ping')
        print("Connected to MongoDB!")
    except Exception as e:
        print(f"Could not connect to MongoDB: {e}")

async def close_mongo_connection():
    if db.client:
        db.client.close()
        print("MongoDB connection closed.")

def get_database():
    return db.client[DB_NAME]
