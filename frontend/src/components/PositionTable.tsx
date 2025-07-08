import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Minus,
  Copy,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import { Project, FilterOptions, Position } from '../types';
import {
  getPositionColor,
  getTrendIcon,
  getTrendColor,
  generateClientLink,
} from '../utils/positionUtils';
import {
  runPositionCheck,
  fetchPositions,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  exportPositionsExcel
} from '../utils/api';
import { KeywordManager } from './KeywordManager';
import { EditProjectMenu } from './EditProjectMenu';
import { ExportModal } from './ExportModal';

interface PositionTableProps {
  project: Project;
  onProjectLoaded: (project: Project) => void; // для обновления локального состояния
  onUpdateProject: (project: Project) => void; // для явного обновления на сервер
}

function getDatesForPeriod(period: FilterOptions['period'], offset: number): Date[] {
  const today = new Date();
  const dates: Date[] = [];

  if (period === 'week') {
    // Получаем понедельник текущей недели с учётом offset
    const currentDay = today.getDay() === 0 ? 7 : today.getDay(); // воскресенье = 7
	const monday = new Date(today);
	monday.setHours(0, 0, 0, 0); // обнуляем время
	monday.setDate(today.getDate() - currentDay + 1 + offset * 7);


    for (let i = 0; i < 7; i++) {
	  const d = new Date(monday);
	  d.setDate(monday.getDate() + i);
	  d.setHours(0, 0, 0, 0);
	  dates.push(d);
	}

  } else if (period === 'month') {
    // Получаем первый день месяца с учётом offset
    const year = today.getFullYear();
    const month = today.getMonth() + offset; // offset может быть отрицательным

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      dates.push(new Date(year, month, day));
    }
  }
  return dates;
}


export const PositionTable: React.FC<PositionTableProps> = ({
  project,
  onProjectLoaded,
  onUpdateProject,
}) => {
  const [editableProject, setEditableProject] = useState<Project>(project);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [periodOffset, setPeriodOffset] = useState(0);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setEditableProject(project);
  }, [project]);

  const [showClientLink, setShowClientLink] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState('');
  const [filter, setFilter] = useState<FilterOptions>({ period: 'week' });
  const [positions, setPositions] = useState<Position[]>([]);

  // Сброс offset при смене периода
  useEffect(() => {
    setPeriodOffset(0);
  }, [filter.period]);

  useEffect(() => {
	  if (!project?.id) return;
	  async function loadPositions() {
	    try {
	      const data = await fetchPositions(project.id, filter.period, periodOffset);
	      setPositions(data);
	    } catch (error) {
	      console.error('Ошибка загрузки позиций', error);
	    }
	  }
	  loadPositions();
	}, [project?.id, filter.period, periodOffset]);


  const dates = useMemo(() => getDatesForPeriod(filter.period, periodOffset), [filter.period, periodOffset]);


  const formatDateKey = (date: Date): string => {
	  const year = date.getFullYear();
	  const month = (date.getMonth() + 1).toString().padStart(2, '0');
	  const day = date.getDate().toString().padStart(2, '0');
	  return `${year}-${month}-${day}`;
	};

  const positionsMap = useMemo(() => {
	  const map: Record<string, Record<string, Position>> = {};
	  positions.forEach((pos) => {
	    if (!map[pos.keyword_id]) {
	      map[pos.keyword_id] = {};
	    }
	    const dateKey = formatDateKey(new Date(pos.checked_at));
	    map[pos.keyword_id][dateKey] = pos;
	  });
	  return map;
	}, [positions]);

  const filteredKeywords = useMemo(() => {
    return editableProject.keywords.filter((keyword) =>
      keyword.keyword.toLowerCase().includes(keywordFilter.toLowerCase())
    );
  }, [editableProject.keywords, keywordFilter]);

  const uniqueKeywordsWithTop3 = useMemo(() => {
    return new Set(
      positions
        .filter((pos) => pos.position && pos.position <= 3)
        .map((pos) => pos.keyword_id)
    );
  }, [positions]);

  const uniqueKeywordsWithTop10 = useMemo(() => {
    return new Set(
      positions
        .filter((pos) => pos.position && pos.position <= 10)
        .map((pos) => pos.keyword_id)
    );
  }, [positions]);

  const latestCheckDate = useMemo(() => {
    if (!positions.length) return null;
    const dates = positions.map((pos) => new Date(pos.checked_at).getTime());
    const maxTime = Math.max(...dates);
    return new Date(maxTime);
  }, [positions]);

  const totalCost = editableProject.keywords.reduce(
    (sum, keyword) => sum + (keyword.cost || 0),
    0
  );

  const handleAddKeyword = async (keywordData: Omit<Project['keywords'][0], 'id'>) => {
    const newKeyword = await createKeyword(project.id, keywordData);
    onProjectLoaded({ ...editableProject, keywords: [...editableProject.keywords, newKeyword] });
  };

  const handleUpdateKeyword = async (id: string, keywordData: Partial<Project['keywords'][0]>) => {
    const updatedKeyword = await updateKeyword(project.id, id, keywordData);
    const updatedKeywords = editableProject.keywords.map((k) =>
      k.id === id ? updatedKeyword : k
    );
    onProjectLoaded({ ...editableProject, keywords: updatedKeywords });
  };

  const handleDeleteKeyword = async (id: string) => {
    await deleteKeyword(project.id, id);
    const updatedKeywords = editableProject.keywords.filter((k) => k.id !== id);
    onProjectLoaded({ ...editableProject, keywords: updatedKeywords });
  };

  const copyClientLink = async () => {
	  try {
	    const fullLink = generateClientLink(project.clientLink);
	    await navigator.clipboard.writeText(fullLink);
	    setShowClientLink(true);
	    setTimeout(() => setShowClientLink(false), 2000);
	  } catch (err) {
	    console.error('Не удалось скопировать текст: ', err);
	  }
	};

  const handleExport = async (startDate: string, endDate: string) => {
	  setIsExporting(true);
	  try {
	    const blob = await exportPositionsExcel(project.id, startDate, endDate);
	    const url = window.URL.createObjectURL(blob);
	    const a = document.createElement('a');
	    a.href = url;
	    a.download = `positions_${project.id}_${startDate}_${endDate}.xlsx`; // обязательно download!
	    document.body.appendChild(a);
	    a.click();
	    a.remove();
	    window.URL.revokeObjectURL(url);
	    setIsExportOpen(false);
	  } catch (error) {
	    alert((error as Error).message || 'Ошибка при экспорте');
	  } finally {
	    setIsExporting(false);
	  }
	};



  return (
    <div className="space-y-6">
      {/* Заголовок и кнопки */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{editableProject.domain}</h2>
              <p className="text-gray-600">{editableProject.searchEngine}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
			  onClick={copyClientLink}
			  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
			>
			  <Copy className="w-4 h-4" />
			  {showClientLink ? 'Скопировано!' : 'Ссылка для клиента'}
			</button>


            <button
              onClick={() => setIsEditProjectOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Редактировать проект
            </button>

            <button
		        onClick={() => setIsExportOpen(true)}
		        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
		        disabled={isExporting}
		      >
		        <Calendar className="w-4 h-4" />
		        {isExporting ? 'Экспортируем...' : 'Экспорт в Excel'}
		    </button>

		    <button
		        onClick={() => runPositionCheck(editableProject.id)}
		        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
		      >
		        <BarChart3 className="w-4 h-4" />
		        Проверить сейчас
		    </button>
		    </div>
		  </div>

		  {/* Модальное окно экспорта */}
		  {isExportOpen && (
		    <ExportModal
		      onClose={() => setIsExportOpen(false)}
		      onExport={handleExport}
		    />
		  )}

        {/* Статистика */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-6 h-6 text-green-600" />
              <span className="text-sm font-medium text-gray-700">В ТОП-3</span>
            </div>
            <div className="text-3xl font-bold text-green-600 mb-1">{uniqueKeywordsWithTop3.size}</div>
            <div className="text-sm text-gray-600">из {editableProject.keywords.length} запросов</div>
          </div>

          <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Minus className="w-6 h-6 text-yellow-600" />
              <span className="text-sm font-medium text-gray-700">В ТОП-10</span>
            </div>
            <div className="text-3xl font-bold text-yellow-600 mb-1">{uniqueKeywordsWithTop10.size}</div>
            <div className="text-sm text-gray-600">из {editableProject.keywords.length} запросов</div>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Дата проверки</span>
            </div>
            <div className="text-lg font-bold text-blue-600 mb-1">
              {latestCheckDate ? latestCheckDate.toLocaleDateString('ru-RU') : 'Нет данных'}
            </div>
            <div className="text-sm text-gray-600">Автоматически</div>
          </div>
        </div>

        {/* Фильтры */}
        <div className="flex items-center gap-4 mb-6">
          <select
            value={filter.period}
            onChange={(e) => setFilter({ ...filter, period: e.target.value as FilterOptions['period'] })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
            <option value="custom">Произвольный период</option>
          </select>
          <div className="flex items-center gap-2 mb-4">
			  <button
			    onClick={() => setPeriodOffset(periodOffset - 1)}
			    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
			  >
			    ← Предыдущий
			  </button>
			  <button
			    onClick={() => setPeriodOffset(0)}
			    disabled={periodOffset === 0}
			    className={`px-3 py-1 rounded ${periodOffset === 0 ? 'bg-gray-300 cursor-default' : 'bg-gray-200 hover:bg-gray-300'}`}
			  >
			    Текущий
			  </button>
			  <button
			    onClick={() => setPeriodOffset(periodOffset + 1)}
			    disabled={periodOffset >= 0}
			    className={`px-3 py-1 rounded ${periodOffset >= 0 ? 'bg-gray-300 cursor-default' : 'bg-gray-200 hover:bg-gray-300'}`}
			  >
			    Следующий
			  </button>
		  </div>

          <input
            type="text"
            placeholder="Фильтр по ключевому слову"
            value={keywordFilter}
            onChange={(e) => setKeywordFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Таблица позиций */}
        <div className="overflow-x-auto" style={{ maxWidth: 'calc(100vw - 40px)' }}>
          <table className="min-w-max w-full table-auto border-collapse border border-gray-200">
			  <thead>
			    <tr className="bg-gray-50">
			      <th
			        className="sticky left-0 bg-gray-50 z-20 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[150px] max-w-[400px] border-r border-gray-200"
			      >
			        Ключевой запрос
			      </th>
			      <th
			        className="sticky left-[150px] bg-gray-50 z-20 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[100px] max-w-[250px] border-r border-gray-200"
			      >
			        Регион
			      </th>
                {dates.map((date) => {
				  const dateKey = formatDateKey(date);
				  return (
                   <th
				      key={date.toISOString()}
				      className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[70px]"
				    >
				      {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
				    </th>
				  );
				})}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
			    {filteredKeywords.map((keyword) => {
			      const posByDate = positionsMap[keyword.id] || {};
			      return (
			        <tr key={keyword.id} className="hover:bg-gray-50">
			          <td
			            className="sticky left-0 bg-white z-10 px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[150px] max-w-[400px] border-r border-gray-200"
			          >
			            {keyword.keyword}
			          </td>
			          <td
			            className="sticky left-[150px] bg-white z-10 px-4 py-3 whitespace-nowrap text-sm text-gray-700 min-w-[100px] max-w-[250px] border-r border-gray-200"
			          >
			            {keyword.region}
			          </td>
                    {dates.map((date) => {
					  const dateKey = formatDateKey(date);
					  const pos = posByDate[dateKey];
                      if (!pos) {
                        return (
                          <td key={dateKey} className="px-3 py-2 text-center text-sm text-gray-400">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={dateKey} className="px-3 py-2 text-center text-sm">
                          <div className="flex items-center justify-center gap-1">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPositionColor(
                                pos.position
                              )}`}
                            >
                              {pos.position ? `#${pos.position}` : '—'}
                            </span>
                            <span
                              className={`text-xs ${getTrendColor(pos.trend)}`}
                              title="Динамика позиции"
                            >
                              {getTrendIcon(pos.trend)}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Редактирование ключевых слов */}
      <KeywordManager
        keywords={editableProject.keywords}
        onAddKeyword={handleAddKeyword}
        onUpdateKeyword={handleUpdateKeyword}
        onDeleteKeyword={handleDeleteKeyword}
      />

      {/* Модальное окно редактирования проекта */}
      {isEditProjectOpen && (
        <EditProjectMenu
          project={editableProject}
          onClose={() => setIsEditProjectOpen(false)}
          onSave={(updatedProject) => {
            setEditableProject(updatedProject);
            onUpdateProject(updatedProject);
            setIsEditProjectOpen(false);
          }}
        />
      )}
    </div>
  );
};
