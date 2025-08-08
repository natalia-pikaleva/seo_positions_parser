from fastapi import APIRouter, Query, HTTPException, Depends
from datetime import datetime, timedelta
from sqlalchemy import and_, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from database.db_init import get_db
from database.models import TaskStatus, TaskStatusEnum
from sqlalchemy.future import select

router = APIRouter()


@router.get("/")
async def get_task_status_by_date(
        date_str: str = Query(default=None, description="Дата в формате YYYY-MM-DD, например 2025-08-08"),
        db: AsyncSession = Depends(get_db)):
    """
    Получить состояние задачи run_main_task по дате запуска.
    По умолчанию возвращает статус задач, запущенных сегодня.
    """
    # Парсим дату или ставим сегодня по умолчанию
    if date_str:
        try:
            query_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат даты. Используйте YYYY-MM-DD.")
    else:
        query_date = datetime.utcnow().date()

    # Ищем последнюю задачу run_main_task, запущенную в указанную дату (по started_at)
    # Фильтрация по дате без времени
    result = await db.execute(
        select(TaskStatus)
        .where(
            and_(
                TaskStatus.task_name == "run_main_task",
                cast(TaskStatus.started_at, Date) == query_date
            )
        )
        .order_by(TaskStatus.started_at.desc())
        .limit(1)
    )
    task_status = result.scalar_one_or_none()

    if not task_status:
        return {"status": "not_found", "message": f"Задача снятия позиций не найдена на дату {query_date}.\n"
                                                  f"Задача будет выполнена по расписанию, старт в 11:30\n"
                                                  f"Если время выполнения задачи наступило, но статус не меняется, обратитесь к администратору"}

    # Формируем ответ в зависимости от статуса задачи
    response = {
        "task_id": task_status.task_id,
        "task_name": task_status.task_name,
        "started_at": task_status.started_at.isoformat() if task_status.started_at else None,
        "finished_at": task_status.finished_at.isoformat() if task_status.finished_at else None,
        "status": task_status.status.value if hasattr(task_status.status, "value") else task_status.status,
    }

    if task_status.status == "in_progress" or task_status.status == TaskStatusEnum.in_progress:
        response["message"] = "Задача выполняется, пожалуйста дождитесь окончания."

    elif task_status.status == "completed" or task_status.status == TaskStatusEnum.completed:
        result = task_status.result or {}
        failed_projects = result.get("failed_projects", [])
        access_denied_domains = result.get("access_denied_domains", [])

        if not failed_projects and not access_denied_domains:
            friendly_message = "Задача выполнена успешно. Все проекты обработаны."

        else:
            messages = []
            if failed_projects:
                projects_list = "\n".join(f"- {proj}" for proj in failed_projects)
                messages.append(f"Не удалось обновить позиции для следующих проектов:\n{projects_list}")
            if access_denied_domains:
                domains_list = "\n".join(f"- {domain}" for domain in access_denied_domains)
                messages.append(f"Доступ запрещён для следующих проектов:\n{domains_list}")

            friendly_message = "Задача выполнена с предупреждениями:\n" + "\n\n".join(messages)

        response["message"] = friendly_message
        response["result"] = result

    elif task_status.status == "failed" or task_status.status == TaskStatusEnum.failed:
        response["message"] = "Задача завершилась с ошибкой."
        response["error_message"] = task_status.error_message

    else:
        response["message"] = f"Статус задачи: {task_status.status}"

    return response
