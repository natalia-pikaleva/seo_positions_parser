import React, { useState } from 'react';
import { BarChart, Users, TrendingUp, Calendar, Plus, RefreshCw } from 'lucide-react';
import { Project } from '../types';
import { API_BASE } from '../utils/config';

interface DashboardProps {
  projects: Project[];
  onCreateProject: () => void;
  onSelectProject: (project: Project) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ projects, onCreateProject, onSelectProject }) => {
  const totalKeywords = projects.reduce((sum, project) => sum + project.keywords.length, 0);
  const totalCost = projects.reduce((sum, project) => 
    sum + project.keywords.reduce((keywordSum, keyword) => keywordSum + (keyword.cost || 0), 0), 0
  );
  const activeProjects = projects.length;

  // Состояния для модального окна и статуса задачи
  const [modalOpen, setModalOpen] = useState(false);
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Функция запроса статуса задачи
  const fetchTaskStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      // Запрос без параметра date_str для даты сегодня, можно добавить при необходимости
      const response = await fetch(`${API_BASE}/task-status/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Ошибка запроса');
      }
      const data = await response.json();
      setTaskStatus(data);
    } catch (err: any) {
      setError(err.message || 'Неизвестная ошибка');
      setTaskStatus(null);
    } finally {
      setLoading(false);
      setModalOpen(true);  // Открываем окно с результатом
    }
  };

  // Закрытие модального окна
  const closeModal = () => {
    setModalOpen(false);
    setTaskStatus(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Заголовок + кнопка */}
	  <div className="flex flex-col sm:flex-row
                items-center sm:items-center
                justify-center sm:justify-between
                gap-4 text-center sm:text-left">
		  <div>
		    <h1 className="text-3xl font-bold text-gray-900">SEO Позиции</h1>
		    <p className="text-gray-600">Мониторинг позиций сайтов в поисковых системах</p>
		  </div>

		  <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
           <button
             onClick={fetchTaskStatus}
             className="flex items-center gap-2 px-5 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
           >
             <RefreshCw className="w-5 h-5" />
             Проверить статус задачи
           </button>

           <button
             onClick={onCreateProject}
             className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
           >
             <Plus className="w-5 h-5" />
             Создать проект
           </button>
         </div>
	  </div>


      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Активные проекты</p>
              <p className="text-2xl font-bold text-gray-900">{activeProjects}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Ключевые запросы</p>
              <p className="text-2xl font-bold text-gray-900">{totalKeywords}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Users className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Общая стоимость</p>
              <p className="text-2xl font-bold text-gray-900">{totalCost.toLocaleString()} ₽</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Последняя проверка</p>
              <p className="text-sm font-bold text-gray-900">Сегодня, 12:00</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Проекты</h2>
        </div>
        <div className="p-6">
          {projects.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <BarChart className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Нет проектов</h3>
              <p className="text-gray-600 mb-6">Создайте первый проект для мониторинга позиций</p>
              <button
                onClick={onCreateProject}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Создать проект
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onSelectProject(project)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">{project.domain}</h3>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{project.keywords.length} запросов</span>
                    <span>{project.searchEngine}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm">
                      <span className="text-gray-600">Стоимость: </span>
                      <span className="font-medium text-gray-900">
                        {project.keywords.reduce((sum, k) => sum + (k.cost || 0), 0).toLocaleString()} ₽
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(project.createdAt).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


    {/* Модальное окно */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={closeModal} // Закрытие по клику на подложку
        >
          <div
            className="bg-white rounded-lg shadow-lg w-11/12 max-w-lg p-6 relative"
            onClick={e => e.stopPropagation()} // Чтобы клик внутри модального не закрывал его
          >
            <button
              onClick={closeModal}
              className="absolute top-3 right-3 text-gray-600 hover:text-gray-900"
              aria-label="Закрыть"
            >
              &#10005;
            </button>

            <h2 className="text-xl font-semibold mb-4">Статус задачи</h2>

            {loading ? (
			  <p>Загрузка данных...</p>
			) : error ? (
			  <p className="text-red-600">Ошибка: {error}</p>
			) : taskStatus ? (
			  <div>
			    <p><b>Статус:</b> {taskStatus.status}</p>
			    <p><b>Сообщение:</b> {taskStatus.message || 'Нет сообщения'}</p>

			    {/* Пользовательский дружественный вывод при успешном или частично успешном результате */}
			    {taskStatus.status === 'completed' && taskStatus.result && (
			      <div className="mt-4 text-sm max-h-60 overflow-auto rounded bg-gray-50 p-3">
			        {/* Если нет ошибок — показываем сообщение об успешном выполнении */}
			        {(!taskStatus.result.failed_projects?.length && !taskStatus.result.access_denied_domains?.length) ? (
			          <p>Все проекты обработаны успешно.</p>
			        ) : (
			          <>
			            {/* Если есть неудачные проекты */}
			            {taskStatus.result.failed_projects?.length > 0 && (
			              <div className="mb-3">
			                <p>Не удалось обновить позиции для следующих проектов:</p>
			                <ul className="list-disc list-inside ml-4 max-h-32 overflow-auto">
			                  {taskStatus.result.failed_projects.map((proj: string, index: number) => (
			                    <li key={index}>{proj}</li>
			                  ))}
			                </ul>
			              </div>
			            )}

			            {/* Если есть проекты с доступом отказано */}
			            {taskStatus.result.access_denied_domains?.length > 0 && (
			              <div>
			                <p>Доступ запрещён для следующих проектов:</p>
			                <ul className="list-disc list-inside ml-4 max-h-32 overflow-auto">
			                  {taskStatus.result.access_denied_domains.map((domain: string, index: number) => (
			                    <li key={index}>{domain}</li>
			                  ))}
			                </ul>
			              </div>
			            )}
			          </>
			        )}
			      </div>
			    )}

			    {/* Ошибка выполнения */}
			    {taskStatus.status === 'failed' && taskStatus.error_message && (
			      <div className="mt-4 text-red-600 font-medium">
			        <p>Ошибка выполнения задачи:</p>
			        <pre>{taskStatus.error_message}</pre>
			      </div>
			    )}
			  </div>
			) : (
			  <p>Данных о задаче нет</p>
			)}

          </div>
        </div>
      )}
    </div>
  );
};