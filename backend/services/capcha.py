from database.models import Project, Keyword, Position, TrendEnum
from datetime import datetime
from uuid import UUID
import requests
import urllib.parse as urlparse
from services.celery_app import celery_app
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import logging
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import time
from twocaptcha import TwoCaptcha
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains

load_dotenv()

DB_USER = os.getenv("POSTGRES_USER", "amin")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "my_super_password")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "seo_parser_db")

API_KEY_CAPTCHA = os.getenv("API_KEY_CAPTCHA")
solver = TwoCaptcha(API_KEY_CAPTCHA)

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

logger = logging.getLogger(__name__)


def region_to_lr_code(region: str) -> int:
    mapping = {
        "Москва": 213,
        "Санкт-Петербург": 2,
        "Новосибирск": 154,
        "Екатеринбург": 159,
    }
    return mapping.get(region, 213)  # по умолчанию Москва

def save_captcha_screenshot(driver, folder='uploads') -> str:
    if not os.path.exists(folder):
        os.makedirs(folder)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"captcha_{timestamp}.png"
    filepath = os.path.join(folder, filename)
    driver.save_screenshot(filepath)
    logger.info(f"Скриншот капчи сохранён: {filepath}")
    return filepath

def solve_yandex_smartcaptcha(driver, api_key=API_KEY_CAPTCHA, max_wait=240, max_retries=3) -> bool:
    """
    Решение SmartCaptcha через отправку скриншота на 2Captcha.
    """
    for attempt in range(max_retries):
        logger.info(f"Попытка решения SmartCaptcha {attempt + 1} из {max_retries}")
        try:
            screenshot_path = "captcha.png"
            driver.save_screenshot(screenshot_path)
            logger.info(f"Скриншот капчи сохранён: {screenshot_path}")

            with open(screenshot_path, 'rb') as f:
                files = {'file': f}
                data = {
                    'key': api_key,
                    'method': 'post',
                    'json': 1
                }
                resp_in = requests.post("http://2captcha.com/in.php", files=files, data=data)

            if resp_in.status_code != 200:
                logger.error(f"Ошибка отправки капчи: HTTP {resp_in.status_code}")
                return False

            resp_json = resp_in.json()
            if resp_json.get('status') != 1:
                logger.error(f"Ошибка отправки капчи: {resp_json.get('request')}")
                return False

            captcha_id = resp_json['request']
            logger.info(f"Задача капчи принята, ID: {captcha_id}")

            wait_time = 0
            while wait_time < max_wait:
                time.sleep(5)
                wait_time += 5

                resp_res = requests.get("http://2captcha.com/res.php", params={
                    'key': api_key,
                    'action': 'get',
                    'id': captcha_id,
                    'json': 1
                })

                if resp_res.status_code != 200:
                    logger.warning(f"Ошибка получения решения капчи: HTTP {resp_res.status_code}")
                    continue

                res_json = resp_res.json()
                if res_json.get('status') == 1:
                    token = res_json['request']
                    logger.info("SmartCaptcha решена, вставляем токен...")
                    break
                elif res_json.get('request') == 'CAPCHA_NOT_READY':
                    logger.info("Решение капчи ещё не готово, ждём...")
                    continue
                else:
                    logger.error(f"Ошибка при решении капчи: {res_json.get('request')}")
                    return False
            else:
                logger.error("Таймаут ожидания решения капчи")
                return False

            driver.execute_script("""
                var el = document.querySelector('input[name="smart-token"]');
                if(el) el.value = arguments[0];
                window.smartCaptchaToken = arguments[0];
            """, token)

            try:
                submit_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
                submit_button.click()
                logger.info("Нажата кнопка подтверждения капчи")
            except Exception:
                logger.info("Кнопка отправки не найдена, возможно капча решилась автоматически")

            time.sleep(7)

            # Удаляем скриншот после использования
            import os
            if os.path.exists(screenshot_path):
                os.remove(screenshot_path)

            return True

        except Exception as e:
            logger.error(f"Ошибка при решении капчи: {e}")
            import traceback
            logger.error(traceback.format_exc())
            import os
            if os.path.exists(screenshot_path):
                os.remove(screenshot_path)
            if attempt < max_retries - 1:
                logger.info("Повторная попытка решения капчи через 10 секунд...")
                time.sleep(10)
            else:
                logger.error("Максимальное количество попыток исчерпано")
                return False


def wait_for_recaptcha_iframe(driver, timeout=15):
    # Попытка найти iframe с reCAPTCHA по нескольким вариантам селекторов
    selectors = [
        "iframe[title='reCAPTCHA']",
        "iframe[src*='recaptcha']",
        "iframe[src*='google.com/recaptcha/']"
    ]
    for selector in selectors:
        try:
            iframe = WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, selector))
            )
            return iframe
        except:
            continue
    return None


def click_recaptcha_checkbox(driver, timeout=15) -> bool:
    iframe = wait_for_recaptcha_iframe(driver, timeout)
    if not iframe:
        logger.error("Iframe с reCAPTCHA не найден")
        return False
    try:
        driver.switch_to.frame(iframe)
        checkbox = WebDriverWait(driver, timeout).until(
            EC.element_to_be_clickable((By.ID, "recaptcha-anchor"))
        )
        checkbox.click()
        driver.switch_to.default_content()
        logger.info("Клик по reCAPTCHA checkbox выполнен")
        return True
    except Exception as e:
        logger.error(f"Ошибка при клике по reCAPTCHA: {e}")
        driver.switch_to.default_content()
        return False
    finally:
        driver.switch_to.default_content()


def solve_recaptcha_v2(driver, api_key=API_KEY_CAPTCHA, max_wait=180) -> bool:
    try:
        sitekey_elem = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '.g-recaptcha'))
        )
        sitekey = sitekey_elem.get_attribute('data-sitekey')
    except Exception:
        iframe = driver.find_element(By.CSS_SELECTOR, 'iframe[title="reCAPTCHA"]')
        src = iframe.get_attribute('src')
        parsed = urlparse.urlparse(src)
        params = urlparse.parse_qs(parsed.query)
        sitekey = params.get('k', [None])[0]

    if not sitekey:
        logger.error("Не удалось найти sitekey reCAPTCHA")
        return False

    page_url = driver.current_url
    logger.info(f"Отправляем reCAPTCHA v2 на решение, sitekey: {sitekey}, url: {page_url}")

    resp_in = requests.post("http://2captcha.com/in.php", data={
        'key': api_key,
        'method': 'userrecaptcha',
        'googlekey': sitekey,
        'pageurl': page_url,
        'json': 1
    })

    if resp_in.status_code != 200:
        logger.error(f"Ошибка отправки reCAPTCHA: HTTP {resp_in.status_code}")
        return False

    resp_json = resp_in.json()
    if resp_json.get('status') != 1:
        logger.error(f"Ошибка отправки reCAPTCHA: {resp_json.get('request')}")
        return False

    captcha_id = resp_json['request']
    logger.info(f"Задача reCAPTCHA принята, ID: {captcha_id}")

    wait_time = 0
    while wait_time < max_wait:
        time.sleep(5)
        wait_time += 5
        resp_res = requests.get("http://2captcha.com/res.php", params={
            'key': api_key,
            'action': 'get',
            'id': captcha_id,
            'json': 1
        })
        if resp_res.status_code != 200:
            logger.warning(f"Ошибка получения решения reCAPTCHA: HTTP {resp_res.status_code}")
            continue
        res_json = resp_res.json()
        if res_json.get('status') == 1:
            token = res_json['request']
            logger.info("reCAPTCHA решена, вставляем токен...")
            break
        elif res_json.get('request') == 'CAPCHA_NOT_READY':
            logger.info("Решение reCAPTCHA ещё не готово, ждём...")
            continue
        else:
            logger.error(f"Ошибка при решении reCAPTCHA: {res_json.get('request')}")
            return False
    else:
        logger.error("Таймаут ожидания решения reCAPTCHA")
        return False

    driver.execute_script("""
        document.getElementById('g-recaptcha-response').style.display = 'block';
        document.getElementById('g-recaptcha-response').value = arguments[0];
    """, token)

    try:
        submit_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        submit_button.click()
        logger.info("Нажата кнопка подтверждения reCAPTCHA")
    except Exception:
        logger.info("Кнопка отправки не найдена, возможно reCAPTCHA решилась автоматически")

    time.sleep(7)
    return True


def get_yandex_position_selenium(domain: str, keyword: str, region: str) -> int | None:
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    driver = webdriver.Chrome(options=options)

    lr_code = region_to_lr_code(region)
    search_url = f"https://yandex.ru/search/?text={keyword}&lr={lr_code}&numdoc=100"

    try:
        driver.get(search_url)
        time.sleep(3)

        if "captcha" in driver.current_url or "Подтвердите, что вы не робот" in driver.page_source:
            logger.info("Появилась капча, пытаемся кликнуть по чекбоксу...")
            save_captcha_screenshot(driver)

            clicked = click_recaptcha_checkbox(driver)
            if clicked:
                logger.info("Ждём обработки капчи после клика...")
                time.sleep(5)
            else:
                logger.info("Клик по чекбоксу не удался, пытаемся решить через 2Captcha API...")
                solved = solve_recaptcha_v2(driver, API_KEY_CAPTCHA)
                if not solved:
                    logger.error("Не удалось решить капчу, прерываем выполнение")
                    return None
                time.sleep(3)

        results = driver.find_elements(By.CSS_SELECTOR, ".serp-item")
        position = None
        for idx, item in enumerate(results, start=1):
            try:
                link = item.find_element(By.CSS_SELECTOR, "a.organic__url")
                href = link.get_attribute("href").lower()
                if domain.lower() in href:
                    position = idx
                    break
            except Exception:
                continue

        return position

    finally:
        driver.quit()


@celery_app.task(name="tasks.parse_positions_task")
def parse_positions_task(project_id: str):
    logger.info(f"Задача parse_positions_task запущена для проекта {project_id}")
    session = SessionLocal()
    try:
        project_uuid = UUID(project_id)
        project = session.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            logger.error(f"Проект {project_id} не найден")
            return

        for keyword in project.keywords:
            position = get_yandex_position_selenium(project.domain, keyword.keyword, project.region)
            previous_position = None
            last_position_record = (
                session.query(Position)
                .filter(Position.keyword_id == keyword.id)
                .order_by(Position.checked_at.desc())
                .first()
            )
            if last_position_record:
                previous_position = last_position_record.position

            if position is None or position > 10:
                cost = 0
            elif 1 <= position <= 3:
                cost = keyword.price_top_1_3
            elif 4 <= position <= 5:
                cost = keyword.price_top_4_5
            else:  # 6-10
                cost = keyword.price_top_6_10

            if previous_position is None:
                trend = TrendEnum.stable
            elif position is None:
                trend = TrendEnum.down
            elif position < previous_position:
                trend = TrendEnum.up
            elif position > previous_position:
                trend = TrendEnum.down
            else:
                trend = TrendEnum.stable

            pos_record = Position(
                keyword_id=keyword.id,
                checked_at=datetime.utcnow(),
                position=position,
                previous_position=previous_position,
                cost=cost,
                trend=trend,
            )
            session.add(pos_record)

        session.commit()
        logger.info(f"Парсер успешно завершён для проекта {project_id}")

    except Exception as e:
        session.rollback()
        logger.error(f"Ошибка при парсинге проекта {project_id}: {e}")
    finally:
        session.close()
