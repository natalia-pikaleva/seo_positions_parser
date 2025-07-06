Запуск воркера Celery:
celery -A celery_app.celery_app worker --loglevel=info -Q parsing

celery -A services.celery_app worker -l info --pool=solo

celery -A services.celery_app beat -l info

секретный ключ для хеширования можно сгенерировать так:
openssl rand -hex 32
