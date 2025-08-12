import aiohttp
import os
from dotenv import load_dotenv
import logging
import asyncio
from typing import List, Tuple, Optional
from routers.schemas import GroupCreate
import json

logger = logging.getLogger(__name__)
load_dotenv()

TOPVIZOR_ID = os.getenv('TOPVIZOR_ID')
TOPVIZOR_API_KEY = os.getenv('TOPVIZOR_API_KEY')


async def create_project_in_topvisor(session: aiohttp.ClientSession, url: str, name: str = None):
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

    async with session.post(api_url, json=payload, headers=headers) as resp:
        resp.raise_for_status()
        data = await resp.json()
        project_id = data.get("result")
        return project_id


async def import_keywords(session: aiohttp.ClientSession, project_id: int, keywords_list: list):
    url = "https://api.topvisor.com/v2/json/add/keywords_2/keywords/import"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    keywords_str = "\n".join(keywords_list)
    payload = {
        "project_id": project_id,
        "keywords": keywords_str
    }

    async with session.post(url, json=payload, headers=headers) as resp:
        if resp.status != 200:
            text = await resp.text()
            raise RuntimeError(f"Topvisor API returned status {resp.status}: {text}")
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
        "User-Id": str(TOPVIZOR_ID),
        "Authorization": f"Bearer {TOPVIZOR_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "project_id": project_id,
        "filters": [
            {
                "name": "name",
                "operator": "EQUALS",  # Большими буквами
                "values": [keyword]  # Всегда массив
            }
        ]
    }

    import json
    logger.info(f"Запрос: {json.dumps(payload, ensure_ascii=False, indent=2)}")

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            data = await resp.json()
            logger.info(f"Ответ от API {data}")

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
    url = "https://api.topvisor.com/v2/json/edit/projects_2/projects/name"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "id": project_id,
        "name": update_data.get("name")
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


async def retry_request(session_http, url, json_payload, headers, max_retries=5, delay=20):
    for attempt in range(max_retries):
        try:
            async with session_http.post(url, json=json_payload, headers=headers) as resp:
                resp.raise_for_status()
                return await resp.json()
        except (aiohttp.ClientConnectorError, aiohttp.ClientError, asyncio.TimeoutError, OSError) as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(delay)
            else:
                raise e


async def get_region_key_index_static(region_name: str) -> Optional[Tuple[int, int]]:
    key_mapping = {
        "Москва": 213,
        "Санкт-Петербург": 2,
        "Новосибирск": 154,
        "Екатеринбург": 159,
    }
    index_mapping = {
        "Москва": 1,
        "Санкт-Петербург": 3,
        "Новосибирск": 154,
        "Екатеринбург": 159,
    }
    region_name_title = region_name.title()
    key = key_mapping.get(region_name_title)
    index = index_mapping.get(region_name_title)
    if key is not None and index is not None:
        return (key, index)
    return None


async def add_searcher_to_project(session_http: aiohttp.ClientSession, project_id: int, searcher_key: int = 0,
                                  max_retries: int = 5, delay: int = 20):
    url = "https://api.topvisor.com/v2/json/add/positions_2/searchers"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "project_id": project_id,
        "searcher_key": searcher_key  # 0 - Яндекс
    }
    try:
        data = await retry_request(session_http, url, payload, headers, max_retries=max_retries, delay=delay)
        logger.info(f"Added searcher {searcher_key} to project {project_id}: {data}")
        if data is None or (isinstance(data, dict) and data.get("errors")):
            logger.error(
                f"Failed to add searcher {searcher_key} to project {project_id}, response errors: {data.get('errors') if data else 'No data'}")
            return None
        return data
    except Exception as e:
        logger.error(f"Exception in add_searcher_to_project for project {project_id}: {e}", exc_info=True)
        return None


async def add_searcher_region(
        session_http: aiohttp.ClientSession,
        project_id: int,
        searcher_key: int,
        region_key: int,
        region_lang: str = "ru",
        region_device: int = 0,
        region_depth: int = 1,
        timeout: int = 10,
        max_retries: int = 5,
        delay: int = 20):
    url = "https://api.topvisor.com/v2/json/add/positions_2/searchers_regions"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "project_id": project_id,
        "searcher_key": searcher_key,
        "region_key": region_key,
        "region_lang": region_lang,
        "region_device": region_device,
        "region_depth": region_depth,
    }

    try:
        # Используем retry_request с таймаутом оберткой aiohttp.ClientTimeout
        timeout_obj = aiohttp.ClientTimeout(total=timeout)

        for attempt in range(max_retries):
            try:
                async with session_http.post(url, json=payload, headers=headers, timeout=timeout_obj) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    logger.info(
                        f"Added region {region_key} to project {project_id} for searcher {searcher_key}: {data}")
                    if data is None or (isinstance(data, dict) and data.get("errors")):
                        logger.error(
                            f"Response errors when adding region {region_key} to project {project_id}: {data.get('errors')}")
                        # Решаем, хотим ли повторять при ошибках api или возвратить None
                        # Здесь остановимся и вернем None
                        return None
                    return data
            except (aiohttp.ClientConnectorError, aiohttp.ClientError, asyncio.TimeoutError, OSError) as e:
                if attempt < max_retries - 1:
                    logger.warning(
                        f"Attempt {attempt + 1} failed for adding region {region_key} to project {project_id}: {e}. Retrying after {delay}s...")
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"Failed after {max_retries} attempts adding region {region_key} to project {project_id}: {e}")
                    raise
    except aiohttp.ClientResponseError as e:
        logger.error(f"Failed to add region {region_key} to project {project_id}. HTTP error: {e.status} {e.message}")
        raise
    except asyncio.TimeoutError:
        logger.error(f"Request timed out when adding region {region_key} to project {project_id}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error adding region {region_key} to project {project_id}: {e}")
        raise


async def get_keyword_volumes(session_http: aiohttp.ClientSession, project_id: int, region_key: int, searcher_key: int, type_volume: int = 1):
    url = "https://api.topvisor.com/v2/json/get/keywords_2/keywords/"
    headers = {
        "User-Id": TOPVIZOR_ID,
        "Authorization": TOPVIZOR_API_KEY,
        "Content-Type": "application/json"
    }
    # Пример строки поля volume со всеми определителями
    volume_field = f"volume:{region_key}:{searcher_key}:{type_volume}"

    payload = {
        "project_id": project_id,
        "fields": ["name", volume_field],
        # Можно добавить фильтры, если надо
    }

    logger.info(f"Запрос частотности ключевых слов для проекта {project_id} с region_key={region_key} и searcher_key={searcher_key}")

    try:
        data = await retry_request(session_http, url, payload, headers)
        logger.debug(f"Данные частотности: {json.dumps(data, indent=2, ensure_ascii=False)}")
        if "errors" in data:
            logger.error(f"Ошибка в ответе при запросе частотности: {data['errors']}")
            return None
        return data.get("result", [])
    except Exception as e:
        logger.error(f"Ошибка запроса частотности по ключам для проекта {project_id}: {e}", exc_info=True)
        return None

