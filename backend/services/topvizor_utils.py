import aiohttp
import os
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)
load_dotenv()

TOPVIZOR_ID = os.getenv('TOPVIZOR_ID')
TOPVIZOR_API_KEY = os.getenv('TOPVIZOR_API_KEY')


async def create_project_in_topvisor(url: str, name: str = None):
    '''Создать проект в Топвизор и получить его id'''
    api_url = "https://api.topvisor.com/v2/json/add/projects_2/projects"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "url": url,
    }
    if name:
        payload["name"] = name

    async with aiohttp.ClientSession() as session:
        async with session.post(api_url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
            # В ответ вернётся поле "result" с ID проекта
            project_id = data.get("result")
            return project_id


async def import_keywords(project_id: int, keywords_list: list):
    '''Создать ключевые слова в проекте'''
    url = "https://api.topvisor.com/v2/json/add/keywords_2/keywords/import"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    # Формируем строку с ключевыми словами, каждое с новой строки
    keywords_str = "\n".join(keywords_list)

    payload = {
        "project_id": project_id,
        "keywords": keywords_str
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return data


async def add_or_update_keyword_topvisor(project_id: int, keyword: str):
    url = "https://api.topvisor.com/v2/json/add/keywords_2/keywords/import"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "project_id": project_id,
        "keywords": keyword  # Одно ключевое слово, не список
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return data


async def delete_keyword_topvisor(project_id: int, keyword: str):
    url = "https://api.topvisor.com/v2/json/del/keywords_2/keywords"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "project_id": project_id,
        "keywords": keyword  # Можно передавать ключевое слово для удаления
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return data


async def delete_project_topvisor(project_id: int):
    url = "https://api.topvisor.com/v2/json/del/projects_2/projects"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {"id": project_id}
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
            if "errors" in data:
                raise Exception(f"Topvisor API errors: {data['errors']}")
            return data


async def update_project_topvisor(project_id: int, update_data: dict):
    url = "https://api.topvisor.com/v2/json/edit/projects"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "id": project_id,
        **update_data
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
            if "errors" in data:
                raise Exception(f"Topvisor API ошибка обновления проекта: {data['errors']}")
            return data


async def get_project_info_by_topvizor(topvisor_project_id: int):
    """получить info по проекту из API Topvisor """
    url_projects = "https://api.topvisor.com/v2/json/get/projects_2/projects"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload_projects = {
        "filters": [
            {
                "name": "id",
                "operator": "EQUALS",
                "values": [topvisor_project_id]
            }
        ],
        "show_searchers_and_regions": 1
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(url_projects, json=payload_projects, headers=headers) as resp:
            if resp.status != 200:
                logger.error(f"Ошибка получения данных проекта {topvisor_project_id}: HTTP {resp.status}")
                return
            data_projects = await resp.json()

    return data_projects

    # try:
    #     # 2. Получаем ключевые слова с целевыми URL
    #     url_keywords = "https://api.topvisor.com/v2/json/get/keywords_2/keywords"
    #     payload_keywords = {
    #         "project_id": topvisor_project_id,
    #         "limit": 10
    #     }
    #     async with session_http.post(url_keywords, json=payload_keywords, headers=headers) as resp:
    #         if resp.status != 200:
    #             logger.error(f"Ошибка получения ключевых слов проекта {topvisor_project_id}: HTTP {resp.status}")
    #             return
    #         data_keywords = await resp.json()
    #
    #     logger.debug(f"Ответ API по ключам: {data_keywords}")
    #
    # except Exception as e:
    #     logging.error(f"Error during get project info: {e}")
    #     raise
