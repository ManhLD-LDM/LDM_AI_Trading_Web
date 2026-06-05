import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test():
    try:
        print('Creating client...')
        client = AsyncIOMotorClient('mongodb+srv://user:pass@cluster0..mongodb.net')
        print('Client created:', client)
        await client.admin.command('ping')
        print('Ping done')
    except Exception as e:
        print('Caught exception:', type(e), e)

asyncio.run(test())
