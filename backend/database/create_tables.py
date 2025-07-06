import asyncio
from db_init import engine, Base
from models import Project, Keyword, Position  # импорт моделей для регистрации

async def create_tables():
    async with engine.begin() as conn:
        # Создаёт все таблицы, описанные в Base.metadata
        await conn.run_sync(Base.metadata.create_all)

if __name__ == "__main__":
    asyncio.run(create_tables())
