import React, { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { Group, GroupCreate, GroupUpdate, Project } from '../types';
import { Copy, Plus, Calendar, TrendingUp, RefreshCw } from 'lucide-react';

import { API_BASE } from '../utils/config';
import { ExportModal } from './ExportModal';
import { exportPositionsExcel, runProjectParsing, exportPositionsPivotExcel, archiveProject } from '../utils/api';
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
    const [exportFunction, setExportFunction] = useState<(startDate: string, endDate: string) => void>(() => () => { });
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

    // Проверяем, все ли группы проекта заархивированы
    const allGroupsArchived = project.groups.every(group => group.is_archived);

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

    const handleExportWithDynamics = async (startDate: string, endDate: string) => {
        setIsExporting(true);
        try {
            // вызов вашей функции экспорта эксель с динамикой
            const blob = await exportPositionsPivotExcel(project.id, startDate, endDate);

            // скачивание файла с нужным именем
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

    // Функция архивации проекта (устанавливает is_archived=true ВСЕМ группам проекта)
    const handleArchiveProject = async () => {
        if (!window.confirm(`Все группы проекта "${project.domain}" заархивированы.
      Нажмите "ОК" чтобы заархивировать весь проект (установить статус архива всем группам).`)) return;

        try {
            setLoading(true);
            setError(null);
            await archiveProject(project.id); // API функция архивирует ВСЕ группы проекта
            const updatedProject = await refreshProject();

            if (updatedProject && onProjectGroupLoaded) {
                onProjectGroupLoaded(updatedProject);
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Ошибка архивации проекта');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {allGroupsArchived && (
                <div className="mb-6 p-4 bg-gray-200 border border-gray-200 rounded-lg flex items-center gap-3">
                    <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <div>
                        <p className="font-semibold text-gray-800">Проект в архиве</p>
                        <p className="text-sm text-gray-700">Все группы ({project.groups.length}) заархивированы</p>
                    </div>
                </div>
            )}

            {!isClientView && (
                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={onBack}
                        className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
                        aria-label="Назад к проектам"
                    >
                        ← Назад к проектам
                    </button>

                    {!allGroupsArchived && (
                        <div className="mb-6 flex gap-3">
                            <button
                                onClick={handleArchiveProject}
                                disabled={loading}
                                className="flex items-center gap-2 px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-60 transition-all font-medium shadow-md"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5 3a1 1 0 000 2h10a1 1 0 100-2H5zm0 4a1 1 0 000 2h10a1 1 0 100-2H5zm2 4a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1v-6a1 1 0 00-1-1H7z" clipRule="evenodd" />
                                </svg>
                                <span>Архивировать проект</span>
                            </button>

                            <span className="text-sm text-gray-500 self-center px-3">
                                ({project.groups.length} групп)
                            </span>
                        </div>
                    )}
                </div>
            )}


            <div className="mb-6 flex justify-between items-center">
                {!isClientView && (
                    <div className="mb-6 w-full">
                        <div
                            className="
			      grid grid-cols-2 gap-4 items-center justify-center
			      md:flex md:flex-wrap md:gap-4 md:justify-end md:items-center
			    "
                        >
                            <button
                                onClick={openNewGroupModal}
                                className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm w-full md:w-auto md:text-base"
                            >
                                <Plus className="w-5 h-5" />
                                Добавить группу
                            </button>

                            <button
                                onClick={() => {
                                    setExportFunction(() => handleExport);  // экспорт позиций
                                    setIsExportOpen(true);
                                }}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-60 text-sm w-full md:w-auto md:text-base"
                            >
                                {isExporting ? (
                                    <>
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                        Экспортируем...
                                    </>
                                ) : (
                                    <>
                                        <Calendar className="w-5 h-5" />
                                        Экспорт позиций в Excel
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => {
                                    setExportFunction(() => handleExportWithDynamics);  // экспорт с динамикой
                                    setIsExportOpen(true);
                                }}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-60 text-sm w-full md:w-auto md:text-base"
                            >
                                Экспорт с динамикой
                            </button>


                            <button
                                onClick={copyClientLink}
                                className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm w-full md:w-auto md:text-base"
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
                                className={`flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors text-sm w-full md:w-auto md:text-base ${parsing ? 'opacity-60 cursor-wait' : ''
                                    }`}
                                disabled={parsing}
                                title="Запустить обновление позиций"
                            >
                                <TrendingUp className="w-4 h-4" />
                                {parsing ? 'Запуск...' : 'Обновить позиции'}
                            </button>
                        </div>

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
                            className={`border rounded-lg shadow cursor-pointer p-4 flex flex-col justify-between transition-all ${group.is_archived
                                    ? 'bg-gray-100 border-gray-300 shadow-sm opacity-75 hover:shadow-md'  // Серый фон для архива
                                    : 'border-gray-200 bg-white hover:shadow-lg'                         // Обычный стиль
                                }`}
                            onClick={() => onSelectGroup(group)}
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-lg mb-1">{group.title}</h3>
                                    {group.is_archived && (
                                        <div className="flex items-center gap-1 px-2 py-1 bg-gray-200 text-xs text-gray-700 rounded-full">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            Архив
                                        </div>
                                    )}
                                </div>
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
            {isExportOpen && (
                <ExportModal
                    onClose={() => setIsExportOpen(false)}
                    onExport={exportFunction}
                />
            )}


        </div>
    );
};
