import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, TrendingUp, Minus, Copy, Calendar, Star } from 'lucide-react';

import { Project, FilterOptions, Position } from '../types';
import {
  fetchPositions,
  fetchPositionsIntervals,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  exportPositionsExcel,
} from '../utils/api';
import { getPositionColor, getTrendIcon, getTrendColor, generateClientLink } from '../utils/positionUtils';
import { KeywordManager } from './KeywordManager';
import { EditProjectMenu } from './EditProjectMenu';
import { ExportModal } from './ExportModal';

// Импортируем выделенные компоненты
import { PositionFilters } from './PositionFilters';
import { PositionStats } from './PositionStats';
import { PositionTableView } from './PositionTableView';

interface PositionTableProps {
  project: Project;
  onProjectLoaded: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
}

function getDatesForCurrentMonth(offset: number): Date[] {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + offset; // offset для переключения месяцев
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates: Date[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(new Date(year, month, day));
  }
  return dates;
}

function getDatesForPeriod(period: FilterOptions['period'], offset: number): Date[] {
  const today = new Date();
  const dates: Date[] = [];

  if (period === 'week') {
    const currentDay = today.getDay() === 0 ? 7 : today.getDay(); // воскресенье = 7
    const monday = new Date(today);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(today.getDate() - currentDay + 1 + offset * 7);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      d.setHours(0, 0, 0, 0);
      dates.push(d);
    }
  } else if (period === 'month') {
    // Можно использовать вашу функцию getDatesForCurrentMonth
    return getDatesForCurrentMonth(offset);
  }

  return dates;
}

function generateBiweeklyIntervalsFromStart(startDate: Date, endDate: Date): { startDate: Date; endDate: Date; label: string }[] {
  const intervals = [];
  let currentStart = new Date(startDate);
  currentStart.setHours(0, 0, 0, 0);

  while (currentStart <= endDate) {
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 13);
    if (currentEnd > endDate) currentEnd.setTime(endDate.getTime());

    intervals.push({
      startDate: new Date(currentStart),
      endDate: new Date(currentEnd),
      label: `${currentStart.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} - ${currentEnd.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`
    });

    currentStart.setDate(currentStart.getDate() + 14);
  }

  return intervals;
}


export const PositionTable: React.FC<PositionTableProps> = ({
	project,
    onProjectLoaded,
    onUpdateProject,
  }) => {
	  const [periodOffset, setPeriodOffset] = useState(0);
	  const [filter, setFilter] = useState<FilterOptions>({ period: 'month' });
	  const [intervalSums, setIntervalSums] = useState<Record<string, Record<string, number>>>({});
	  const [editableProject, setEditableProject] = useState<Project>(project);
	  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
	  const [isExportOpen, setIsExportOpen] = useState(false);
	  const [isExporting, setIsExporting] = useState(false);
	  const [projectCreatedAt, setProjectCreatedAt] = useState<Date | null>(null);
	  const [keywordFilter, setKeywordFilter] = useState('');
	  const [positions, setPositions] = useState<Position[]>([]);
	  const [showClientLink, setShowClientLink] = useState(false);
	  const [serverIntervals, setServerIntervals] = useState< { dates: Date[]; startDate: string; endDate: string }[] >([]);


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
	      setProjectCreatedAt(new Date(project.createdAt));
	    }
	    setEditableProject(project);
	  }, [project]);

	  const dates = useMemo(() => {
		  if (filter.period === 'week') {
		    return getDatesForPeriod('week', periodOffset);
		  }
		  if (filter.period === 'month') {
		    return getDatesForCurrentMonth(periodOffset);
		  }
		  return [];
		}, [filter.period, periodOffset]);

	  const headerDates = useMemo(() => {
		  if (filter.period === 'week') {
		    return getDatesForPeriod('week', periodOffset);
		  }
		  if (filter.period === 'month') {
		    return getDatesForCurrentMonth(periodOffset);
		  }
		  return [];
		}, [filter.period, periodOffset]);


	  const biweeklyIntervals = useMemo(() => {
		  if (filter.period !== 'month' || !projectCreatedAt) return [];

		  const monthStart = dates[0];
		  const monthEnd = dates[dates.length - 1];

		  // Генерируем интервалы от даты старта до конца текущего месяца
		  const allIntervals = generateBiweeklyIntervalsFromStart(projectCreatedAt, monthEnd);

		  // Фильтруем интервалы, чтобы оставить только те, что пересекаются с текущим месяцем
		  return allIntervals.filter(interval =>
		    interval.endDate >= monthStart && interval.startDate <= monthEnd
		  );
		}, [filter.period, projectCreatedAt, dates]);



	// Загрузка позиций
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

  // Загрузка агрегированных сумм по интервалам
  useEffect(() => {
	  async function loadIntervalSums() {
	    if (!project?.id) return;

	    try {
	      const data = await fetchPositionsIntervals(project.id, filter.period, periodOffset);

	      // Формируем карту сумм по ключевым словам и интервалам
	      const sumsMap: Record<string, Record<string, number>> = {};
	      data.forEach(({ keyword_id, intervals }) => {
	        sumsMap[keyword_id] = {};
	        intervals.forEach(({ start_date, end_date, sum_cost }) => {
	          const label = `${start_date} - ${end_date}`;
	          sumsMap[keyword_id][label] = sum_cost;
	        });
	      });
	      setIntervalSums(sumsMap);

	      // Формируем массив интервалов с датами из всех ключевых слов (берём первый, если уверены, что одинаковые)
	      if (data.length > 0) {
	        const intervalsGroups = data[0].intervals.map(interval => {
	          const start = new Date(interval.display_start_date);
	          const end = new Date(interval.display_end_date);
	          const dates: Date[] = [];
	          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
	            dates.push(new Date(d));
	          }
	          return {
	            dates,
	            startDate: interval.start_date,
	            endDate: interval.end_date,
	            display_start_date: interval.display_start_date,
	            display_end_date: interval.display_end_date,
	          };
	        }).filter(group => group.dates.length > 0);

	        setServerIntervals(intervalsGroups);
	      } else {
	        setServerIntervals([]);
	      }
	    } catch (error) {
	      console.error('Ошибка загрузки интервалов:', error);
	      setServerIntervals([]);
	    }
	  }

	  loadIntervalSums();
	}, [project?.id, filter.period, periodOffset]);

  // Вычисление последнего дня месяца с учётом periodOffset
  const getLastDayOfMonth = (date: Date): string => {
	  const year = date.getFullYear();
	  const month = date.getMonth();
	  const lastDay = new Date(year, month + 1, 0);
	  return lastDay.toISOString().slice(0, 10);
	};

  const today = new Date();
  const offsetMonth = new Date(today.getFullYear(), today.getMonth() + periodOffset, 1);
  const lastDayOfMonth = getLastDayOfMonth(offsetMonth);

  // Сортируем интервалы по дате начала
  const sortedIntervals = useMemo(() => {
	  return [...(serverIntervals || [])].sort(
	    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
	  );
	}, [serverIntervals]);

	console.log('sortedIntervals before map:', sortedIntervals);

// Функция сравнения дат по дню, месяцу и году
const isSameDay = (date1: Date, date2: Date): boolean =>
  date1.getFullYear() === date2.getFullYear() &&
  date1.getMonth() === date2.getMonth() &&
  date1.getDate() === date2.getDate();

// Формируем расширенные группы с флагом isLastPartial и фильтруем
const extendedDateGroups = sortedIntervals.map((group, idx, arr) => {
  const start = new Date(group.startDate);
  const end = new Date(group.endDate);
  const length = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
  const isLast = idx === arr.length - 1;
  const isPartial = length < 14;

  // Помечаем последний интервал без проверки по дате
  const isLastPartial = isLast && isPartial;

  return { ...group, isLastPartial };
}).filter(group => {
  if (!group.dates || group.dates.length === 0) return false;

  if (group.isLastPartial) return true;

  const start = new Date(group.startDate);
  const end = new Date(group.endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
  return diffDays >= 14;
});


console.log('Extended date groups before filter:', extendedDateGroups);



  // Форматирование даты для ключа
  const formatDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Создание карты позиций для быстрого доступа
  const positionsMap = useMemo(() => {
    const map: Record<string, Record<string, Position>> = {};
    positions.forEach(pos => {
      if (!map[pos.keyword_id]) map[pos.keyword_id] = {};
      const dateKey = formatDateKey(new Date(pos.checked_at));
      map[pos.keyword_id][dateKey] = pos;
    });
    return map;
  }, [positions]);

  // Фильтрация ключевых слов
  const filteredKeywords = useMemo(() => {
    return editableProject.keywords.filter(k =>
      k.keyword.toLowerCase().includes(keywordFilter.toLowerCase())
    );
  }, [editableProject.keywords, keywordFilter]);

  // Подсчёт статистики для PositionStats
  const uniqueKeywordsWithTop1to3 = useMemo(() => {
    return new Set(
      positions
        .filter(pos => pos.position !== undefined && pos.position >= 1 && pos.position <= 3 && filteredKeywords.some(k => k.id === pos.keyword_id))
        .map(pos => pos.keyword_id)
    );
  }, [positions, filteredKeywords]);

  const uniqueKeywordsWithTop4to5 = useMemo(() => {
    return new Set(
      positions
        .filter(pos => pos.position !== undefined && pos.position >= 4 && pos.position <= 5 && filteredKeywords.some(k => k.id === pos.keyword_id))
        .map(pos => pos.keyword_id)
    );
  }, [positions, filteredKeywords]);

  const uniqueKeywordsWithTop6to10 = useMemo(() => {
    return new Set(
      positions
        .filter(pos => pos.position !== undefined && pos.position >= 6 && pos.position <= 10 && filteredKeywords.some(k => k.id === pos.keyword_id))
        .map(pos => pos.keyword_id)
    );
  }, [positions, filteredKeywords]);


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
          </div>
        </div>

        {/* Статистика */}
        <PositionStats
          top1to3={uniqueKeywordsWithTop1to3.size}
          top4to5={uniqueKeywordsWithTop4to5.size}
          top6to10={uniqueKeywordsWithTop6to10.size}
          totalKeywords={editableProject.keywords.length}
        />

        {/* Фильтры */}
        <PositionFilters
          filter={filter}
          setFilter={setFilter}
          periodOffset={periodOffset}
          setPeriodOffset={setPeriodOffset}
          keywordFilter={keywordFilter}
          setKeywordFilter={setKeywordFilter}
        />

        {/* Таблица позиций */}
        <PositionTableView
          editableProject={editableProject}
          filteredKeywords={filteredKeywords}
          positionsMap={positionsMap}
          dates={dates}
          headerDates={headerDates}
          dateGroups={extendedDateGroups}
          filterPeriod={filter.period}
          intervalSums={intervalSums}
          formatDateKey={formatDateKey}
        />

        {/* Остальные компоненты */}
        <KeywordManager
          keywords={editableProject.keywords}
          onAddKeyword={async (keywordData) => {
            const newKeyword = await createKeyword(project.id, keywordData);
            onProjectLoaded({ ...editableProject, keywords: [...editableProject.keywords, newKeyword] });
          }}
          onUpdateKeyword={async (id, keywordData) => {
            const updatedKeyword = await updateKeyword(project.id, id, keywordData);
            const updatedKeywords = editableProject.keywords.map(k => k.id === id ? updatedKeyword : k);
            onProjectLoaded({ ...editableProject, keywords: updatedKeywords });
          }}
          onDeleteKeyword={async (id) => {
            await deleteKeyword(project.id, id);
            const updatedKeywords = editableProject.keywords.filter(k => k.id !== id);
            onProjectLoaded({ ...editableProject, keywords: updatedKeywords });
          }}
        />

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

        {isExportOpen && (
          <ExportModal
            onClose={() => setIsExportOpen(false)}
            onExport={async (startDate, endDate) => {
              setIsExporting(true);
              try {
                const blob = await exportPositionsExcel(project.id, startDate, endDate);
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
            }}
            isExporting={isExporting}
          />
        )}
      </div>
    </div>
  );
};