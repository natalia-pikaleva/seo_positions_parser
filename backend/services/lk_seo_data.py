import os
from dotenv import load_dotenv

import logging

from database.db_init import get_db
from database.models import Project, Keyword, Position, Group, SearchEngineEnum
from routers.schemas import (ProjectCreate, ProjectUpdate, KeywordUpdate,
                             ProjectOut, ClientProjectOut, PositionOut,
                             KeywordCreate, KeywordUpdate, KeywordOut,
                             IntervalSumOut, KeywordIntervals, GroupOut,
                             GroupCreate, GroupUpdate)

import aiohttp

logger = logging.getLogger(__name__)
load_dotenv()

LK_SEO_KORENEV_API_KEY = os.getenv("LK_SEO_KORENEV_API_KEY", "")
URL = "https://lk-seo.korenev.pro/api/get_data/projects"


async def get_lk_seo_korenev_projects():
    try:
        headers = {
            "Content-Type": "application/json",
        }
        payload = {
            "api_key": LK_SEO_KORENEV_API_KEY
        }

        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120)) as session:
            async with session.post(URL, headers=headers, json=payload) as response:
                response.raise_for_status()
                data = await response.json()
                results = data.get("projects")
                lk_projects_processed = []
                for proj_dict in results:
                    proj_dict["owner"] = "lk_seo_korenev"
                    lk_projects_processed.append(ProjectOut(**proj_dict))
                return lk_projects_processed
    except Exception as e:
        logger.error("Ошибка при получении проектов сервиса  lk-seo.korenev.pro %s", e)
        return None
