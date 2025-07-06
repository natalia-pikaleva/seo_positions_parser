from celery import Celery
from celery.schedules import crontab

celery_app = Celery(
    "services",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
    include=["services.task"]  # указываем модуль с задачами
)

# Конфигурация Celery
celery_app.conf.update(
    timezone='Europe/Moscow',  # укажите ваш часовой пояс
    enable_utc=False,          # если хотите использовать локальное время
)

# Настройка расписания для Celery Beat
celery_app.conf.beat_schedule = {
    "parse_positions_nightly": {
        "task": "services.task.parse_positions_task",  # полный путь к задаче
        "schedule": crontab(hour=2, minute=00),
    },
}
