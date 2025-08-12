import React, { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { Group, GroupCreate, GroupUpdate, Project } from '../types';
import { Copy, Plus, Calendar, TrendingUp, RefreshCw } from 'lucide-react';

import { API_BASE } from '../utils/config';
import { ExportModal } from './ExportModal';
import { exportPositionsExcel, runProjectParsing } from '../utils/api';
import { generateClientLink } from '../utils/positionUtils';

interface ProjectGroupsProps {
  project: Project;
  onBack: () => void;
  onSelectGroup: (group: Group) => void;
  refreshProject: () => Promise<Project | null>;
  onProjectGroupLoaded?: (updatedProject: Project) => void;
  isClientView?: boolean;
}


export const ProjectGroups: React.FC<ProjectGroupsProps> = ({
  project,
  onBack,
  onSelectGroup,
  refreshProject,
  isClientView = false,
}) => {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Локальное состояние групп
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClientLink, setShowClientLink] = useState(false);
  const [groupCreatedAt, setGroupCreatedAt] = useState<Date | null>(null);
  const [editableGroup, setEditableGroup] = useState<Project | Group | null>(null);

  const [parsing, setParsing] = useState(false);
  const [parsingMsg, setParsingMsg] = useState<string | null>(null);



  // Для создания/редактирования группы
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [groupForm, setGroupForm] = useState<Omit<GroupCreate, 'projectId'>>({
    title: '',
    region: '',
    searchEngine: 'Яндекс',
    topvisorId: undefined,
  });

  // Для подтверждения удаления группы
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);

  // Загрузка групп из props.project (обновляем при изменении проекта)
  useEffect(() => {
	  setGroups(project.groups || []);
	  setError(null);

	  // Явно закрываем модалку и сбрасываем редактируемую группу при обновлении проекта
	  setGroupModalOpen(false);
	  setEditGroup(null);
	  setGroupForm({
	    title: '',
	    region: '',
	    searchEngine: 'Яндекс',
	    topvisorId: undefined,
	  });
	}, [project]);


  // Обработчик изменения полей формы группы
  const onGroupFormChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setGroupForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Открываем модал для создания новой группы
  const openNewGroupModal = () => {
    setGroupForm({
      title: '',
      region: '',
      searchEngine: 'Яндекс',
      topvisorId: undefined,
    });
    setEditGroup(null);
    setError(null);
    setGroupModalOpen(true);
  };

  // Открываем модал для редактирования существующей группы
  const openEditGroupModal = (group: Group) => {
    setEditGroup(group);
    setGroupForm({
      title: group.title,
      region: group.region,
      searchEngine: group.searchEngine,
      topvisorId: group.topvisorId,
    });
    setError(null);
    setGroupModalOpen(true);
  };

  // Отмена модального окна группы
  const closeGroupModal = () => {
    console.log('closeGroupModal вызвана');
    setGroupModalOpen(false);
    setEditGroup(null);
    setError(null);
  };

  useEffect(() => {
  console.log('groupModalOpen = ', groupModalOpen);
}, [groupModalOpen]);


  // Функция создания группы (POST)
  const createGroup = async (groupData: GroupCreate): Promise<Group> => {
    const res = await fetch(`${API_BASE}/groups/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(groupData),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Ошибка создания группы');
    }
    return res.json();
  };

  // Функция обновления группы (PUT)
  const updateGroup = async (groupId: string, groupData: Partial<GroupUpdate>): Promise<Group> => {
    const res = await fetch(`${API_BASE}/groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(groupData),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Ошибка обновления группы');
    }
    return res.json();
  };

  // Функция удаления группы (DELETE)
  const deleteGroup = async (groupId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/groups/${groupId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Ошибка удаления группы');
    }
  };

  // Отправка формы создания/редактирования группы
  const submitGroupForm = async (e: FormEvent) => {
	  console.log('submitGroupForm вызвана');
	  e.preventDefault();
	  setLoading(true);
	  setError(null);
	  try {
	    if (editGroup) {
	      await updateGroup(editGroup.id, groupForm);
	    } else {
	      await createGroup({ ...groupForm, project_id: project.id });
	    }
	    const updatedProject = await refreshProject();

	    if (!updatedProject) {
	      setError('Ошибка получения обновленных данных проекта');
	      return;
	    }

	    if (onProjectGroupLoaded) {
	      onProjectGroupLoaded(updatedProject);
	    }

	    setGroups(updatedProject.groups || []);
	    console.log("Группа успешно создана, закрываем модалку");
	    closeGroupModal();
	  } catch (e: any) {
	    setError(e.message || 'Ошибка при сохранении группы');
	  } finally {
	    setLoading(false);
	  }
	};


  // Подтверждаем удаление группы
  const confirmDeleteGroup = async () => {
	  if (!groupToDelete) return;
	  setLoading(true);
	  setError(null);
	  try {
	    await deleteGroup(groupToDelete.id);

	    // Сразу закрываем модалку подтверждения удаления
	    setGroupToDelete(null);

	    const updatedProject = await refreshProject();

	    if (!updatedProject) {
	      setError('Ошибка получения обновленных данных проекта');
	      return;
	    }

	    if (onProjectGroupLoaded) {
	      onProjectGroupLoaded(updatedProject);
	    }

	    setGroups(updatedProject.groups || []);
	  } catch (e: any) {
	    setError(e.message || 'Ошибка при удалении группы');
	  } finally {
	    setLoading(false);
	  }
	};




  // Функция вызова API экспорта для проекта
  const handleExport = async (startDate: string, endDate: string) => {
    setIsExporting(true);
    try {
      const blob = await exportPositionsExcel(project.id, startDate, endDate);

      // Скачивание файла
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `positions_${project.id}_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setIsExportOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Ошибка при экспорте');
    } finally {
      setIsExporting(false);
    }
  };

  const copyClientLink = async () => {
	    try {
	      const fullLink = generateClientLink(project.clientLink);
	      await navigator.clipboard.writeText(fullLink);
	      setShowClientLink(true);
	      setTimeout(() => setShowClientLink(false), 2000); // через 2 секунды вернём обратно
	    } catch (err) {
	      console.error('Не удалось скопировать ссылку', err);
	    }
	  };

	  useEffect(() => {
	    if (project?.createdAt) {
	      setGroupCreatedAt(new Date(project.createdAt));
	    }
	    setEditableGroup(project);
	  }, [project]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
        {!isClientView && (
	      <>
		      <button
		        onClick={onBack}
		        className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
		        aria-label="Назад к проектам"
		      >
		        ← Назад к проектам
		      </button>
		  </>
		)}


      <div className="mb-6 flex justify-between items-center">
		  {!isClientView && (
		    <div className="flex flex-wrap gap-4 items-center justify-center md:justify-end w-full">
		      <button
		        onClick={openNewGroupModal}
		        className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
		      >
		        <Plus className="w-5 h-5" />
		        Добавить группу
		      </button>

		      <button
		        onClick={() => setIsExportOpen(true)}
		        disabled={isExporting}
		        className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-60"
		      >
		        {isExporting ? (
		          <>
		            <RefreshCw className="w-5 h-5 animate-spin" />
		            Экспортируем...
		          </>
		        ) : (
		          <>
		            <Calendar className="w-5 h-5" />
		            Экспорт в Excel
		          </>
		        )}
		      </button>

		      <button
		        onClick={copyClientLink}
		        className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
		      >
		        <Copy className="w-5 h-5" />
		        {showClientLink ? 'Скопировано!' : 'Ссылка для клиента'}
		      </button>
		      <button
				    onClick={async () => {
				    setParsing(true);
				    setParsingMsg(null);
				    try {
				      const res = await runProjectParsing(project.id);
				      setParsingMsg(res.message || 'Парсер запущен');
				    } catch (e: any) {
				      setParsingMsg(
				        e?.message?.includes('not found')
				          ? 'Проект не найден'
				          : e?.message || 'Ошибка запуска парсинга'
				      );
				    } finally {
				      setParsing(false);
				      setTimeout(() => setParsingMsg(null), 3000);
				    }
				  }}
				  className={`w-auto flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors ${parsing ? 'opacity-60 cursor-wait' : ''}`}
				  disabled={parsing}
				  title="Запустить обновление позиций"
				>
				  <TrendingUp className="w-4 h-4" />
				  {parsing ? 'Запуск...' : 'Обновить позиции'}
			  </button>
			  <div>
			      {parsingMsg && (
				    <div className="mt-1 text-sm text-blue-700">{parsingMsg}</div>
				  )}
		      </div>
		    </div>
		  )}

          {error && <p className="mb-4 text-red-600">{error}</p>}
      </div>

	  <h1 className="text-3xl font-bold mb-6">Группы проекта: {project.domain}</h1>
      {groups.length === 0 ? (
        <p>Группы отсутствуют</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {groups.map(group => (
            <div
              key={group.id}
              className="border rounded-lg shadow cursor-pointer p-4 flex flex-col justify-between hover:shadow-lg transition"
              onClick={() => onSelectGroup(group)}
             >
              <div>
                <h3 className="font-semibold text-lg mb-1">{group.title}</h3>
                <p className="text-sm text-gray-600">Регион: {group.region}</p>
                <p className="text-sm text-gray-600">Поисковая система: {group.searchEngine}</p>
                <p className="text-sm text-gray-600 mt-1">Ключевых слов: {group.keywords.length}</p>
              </div>

              {/* Для клиента скрываем кнопки изменения и удаления */}
              {!isClientView && (
	              <div className="mt-3 flex justify-end gap-2">
	                <button
	                  className="px-2 py-1 bg-blue-600 rounded hover:bg-blue-800 text-white text-xs"
	                  onClick={e => {
	                    e.stopPropagation();
	                    openEditGroupModal(group);
	                  }}
	                >
	                  Изменить
	                </button>
	                <button
	                  className="px-2 py-1 bg-red-600 rounded hover:bg-red-800 text-white text-xs"
	                  onClick={e => {
	                    e.stopPropagation();
	                    setGroupToDelete(group);
	                    setError(null);
	                  }}
	                >
	                  Удалить
	                </button>
	              </div>
	           )}
            </div>
          ))}
        </div>
      )}

      {/* Модальное окно формы группы */}
      {!isClientView && groupModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
          onClick={closeGroupModal}
        >
          <div
            className="bg-white rounded shadow p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-4">
              {editGroup ? 'Редактировать группу' : 'Создать группу'}
            </h3>
            <form onSubmit={submitGroupForm} className="space-y-4">
              <div>
                <label htmlFor="title" className="block font-medium mb-1">
                  Название группы
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={groupForm.title}
                  onChange={onGroupFormChange}
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  disabled={loading}
                />
              </div>

              <div>
				  <label htmlFor="region" className="block font-medium mb-1">
				    Регион
				  </label>
				  <select
				    id="region"
				    name="region"
				    value={groupForm.region}
				    onChange={onGroupFormChange}
				    required
				    className="w-full border border-gray-300 rounded px-3 py-2"
				    disabled={loading}
				  >
				    <option value="">Выберите регион</option>  {/* необязательный placeholder */}
				    <option value="Москва">Москва</option>
				    <option value="Санкт-Петербург">Санкт-Петербург</option>
				  </select>
			  </div>

              <div>
                <label htmlFor="searchEngine" className="block font-medium mb-1">
                  Поисковая система
                </label>
                <select
                  id="searchEngine"
                  name="searchEngine"
                  value={groupForm.searchEngine}
                  onChange={onGroupFormChange}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  disabled={loading}
                >
                  <option value="Яндекс">Яндекс</option>
                  <option value="Google">Google</option>
                </select>
              </div>

              {error && <p className="text-red-600">{error}</p>}

              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={closeGroupModal}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  disabled={loading}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  disabled={loading}
                >
                  {editGroup ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {!isClientView && groupToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-6 max-w-sm w-full">
            <p className="mb-6">
              Вы уверены, что хотите удалить группу &laquo;{groupToDelete.title}&raquo;? Это действие невозможно
              отменить.
            </p>
            {error && <p className="mb-4 text-red-600">{error}</p>}
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setGroupToDelete(null)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                disabled={loading}
              >
                Отмена
              </button>
              <button
                onClick={confirmDeleteGroup}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                disabled={loading}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

       {/* Модальное окно выбора периода и запуска экспорта */}
      {!isClientView && isExportOpen && (
        <ExportModal
          onClose={() => setIsExportOpen(false)}
          onExport={handleExport}
          isExporting={isExporting}
        />
      )}
    </div>
  );
};
