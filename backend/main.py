from fastapi import (FastAPI, Request, Depends, UploadFile, File,
                     Form, status)
from fastapi.middleware.cors import CORSMiddleware

from database.db_init import get_db, create_tables
from routers.projects_router import router as projects_router
from routers.auth_router import router as auth_router
import logging

logger = logging.getLogger(__name__)


app = FastAPI(title="SEO Position parser")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://31.207.75.202:5173",
    "https://parser.re-spond.com",
    "http://parser.re-spond.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])


# Создание таблиц (запускайте один раз)
@app.on_event("startup")
async def startup():
    await create_tables()


@app.get("/api/")
async def api_root():

    return {"message": "API is working"}

