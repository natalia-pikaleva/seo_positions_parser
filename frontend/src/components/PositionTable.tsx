import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Minus,
  Copy,
  ExternalLink,
  Calendar,
  Star
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
  exportPositionsExcel,
  fetchPositionsIntervals
} from '../utils/api';
import { KeywordManager } from './KeywordManager';
import { EditProjectMenu } from './EditProjectMenu';
import { ExportModal } from './ExportModal';

interface PositionTableProps {
  project: Project;
  onProjectLoaded: (project: Project) => void; // для обновления локального состояния
  onUpdateProject: (project: Project) => void; // для явного обновления на сервер
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

function generateDatesFromStart(startDate: Date, period: FilterOptions['period'], offset: number): Date[] {
  const dates: Date[] = [];
  const baseDate = new Date(startDate);
  baseDate.setHours(0, 0, 0, 0);

  if (period === 'week') {
    const start = new Date(baseDate);
    start.setDate(start.getDate() + offset * 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(d);
    }
  } else if (period === 'month') {
    // Генерируем 28 или 30 дней (2 интервала по 14 дней) от даты старта + offset
    const start = new Date(baseDate);
    start.setDate(start.getDate() + offset * 14);
    for (let i = 0; i < 28; i++) { // или 30 дней, по необходимости
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(d);
    }
  }
  return dates;
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

// Генерация массива дат от даты старта проекта с учётом выбранного периода
function generateBiweeklyDatesFromStart(startDate: Date, offset: number): Date[][] {
  const intervals: Date[][] = [];
  const baseDate = new Date(startDate);
  baseDate.setHours(0, 0, 0, 0);

  // Сдвиг интервалов на offset * 14 дней
  let currentStart = new Date(baseDate);
  currentStart.setDate(currentStart.getDate() + offset * 14);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (currentStart <= today) {
    const group: Date[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(currentStart);
      d.setDate(currentStart.getDate() + i);
      group.push(d);
    }
    intervals.push(group);
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


  const today = new Date();
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




  const dateGroups = useMemo(() => {
  if (filter.period !== 'month') return [];

  // Получаем границы текущего месяца из массива dates
  const monthStart = dates[0];
  const monthEnd = dates[dates.length - 1];

  return biweeklyIntervals.map(interval => {
    const group: Date[] = [];
    // Начинаем с максимума между interval.startDate и monthStart
    const start = interval.startDate > monthStart ? interval.startDate : monthStart;
    // Конец — минимум между interval.endDate и monthEnd
    const end = interval.endDate < monthEnd ? interval.endDate : monthEnd;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      group.push(new Date(d));
    }
    return group;
  });
}, [filter.period, biweeklyIntervals, dates]);


  useEffect(() => {
    if (!project?.id || filter.period !== 'month') {
      setIntervalSums({});
      return;
    }

    async function loadIntervalSums() {
      try {
        const data = await fetchPositionsIntervals(project.id, filter.period, periodOffset);
        // Преобразуем массив в объект для быстрого доступа
        const sumsMap: Record<string, Record<string, number>> = {};
        data.forEach(({ keyword_id, intervals }) => {
          sumsMap[keyword_id] = {};
          intervals.forEach(({ start_date, end_date, sum_cost }) => {
            const label = `${start_date} - ${end_date}`;
            sumsMap[keyword_id][label] = sum_cost;
          });
        });
        setIntervalSums(sumsMap);
      } catch (error) {
        console.error('Ошибка загрузки сумм по интервалам', error);
      }
    }

    loadIntervalSums();
  }, [project?.id, filter.period, periodOffset]);


  useEffect(() => {
    setEditableProject(project);
  }, [project]);

  useEffect(() => {
	  if (project?.createdAt) {
	    setProjectCreatedAt(new Date(project.createdAt));
	  }
	  setEditableProject(project);
	}, [project]);


  const [showClientLink, setShowClientLink] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState('');
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

  const filteredKeywordIds = useMemo(() => new Set(filteredKeywords.map(k => k.id)), [filteredKeywords]);

  const totalCostByDate = useMemo(() => {
  const costMap: Record<string, number> = {};

  filteredKeywords.forEach((keyword) => {
    const posByDate = positionsMap[keyword.id] || {};
    dates.forEach((date) => {
      const dateKey = formatDateKey(date);
      const pos = posByDate[dateKey];
      if (pos && pos.cost) {
        costMap[dateKey] = (costMap[dateKey] || 0) + pos.cost;
      }
    });
  });

  return costMap;
}, [filteredKeywords, positionsMap, dates]);



const uniqueKeywordsWithTop1to3 = useMemo(() => {
  return new Set(
    positions
      .filter(pos =>
        pos.position !== undefined &&
        pos.position >= 1 &&
        pos.position <= 3 &&
        filteredKeywordIds.has(pos.keyword_id)
      )
      .map(pos => pos.keyword_id)
  );
}, [positions, filteredKeywordIds]);

const uniqueKeywordsWithTop4to5 = useMemo(() => {
  return new Set(
    positions
      .filter(pos =>
        pos.position !== undefined &&
        pos.position >= 4 &&
        pos.position <= 5 &&
        filteredKeywordIds.has(pos.keyword_id)
      )
      .map(pos => pos.keyword_id)
  );
}, [positions, filteredKeywordIds]);

const uniqueKeywordsWithTop6to10 = useMemo(() => {
  return new Set(
    positions
      .filter(pos =>
        pos.position !== undefined &&
        pos.position >= 6 &&
        pos.position <= 10 &&
        filteredKeywordIds.has(pos.keyword_id)
      )
      .map(pos => pos.keyword_id)
  );
}, [positions, filteredKeywordIds]);



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


const biweeklyCostByKeyword = useMemo(() => {
  if (biweeklyIntervals.length === 0) return {};

  const result: Record<string, Record<string, number>> = {}; // keywordId -> intervalLabel -> sum

  filteredKeywords.forEach((keyword) => {
    const posByDate = positionsMap[keyword.id] || {};
    result[keyword.id] = {};

    biweeklyIntervals.forEach(({ startDate, endDate, label }) => {
      let sum = 0;
      // Проходим по всем датам интервала
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = formatDateKey(new Date(d));
        const pos = posByDate[dateKey];
        if (pos && pos.cost) {
          sum += pos.cost;
        }
      }
      result[keyword.id][label] = sum;
    });
  });

  return result;
}, [filteredKeywords, positionsMap, biweeklyIntervals]);


const totalBiweeklyCost = useMemo(() => {
  const totals: Record<string, number> = {}; // intervalLabel -> sum

  biweeklyIntervals.forEach(({ label }) => {
    totals[label] = 0;
    filteredKeywords.forEach((keyword) => {
      totals[label] += biweeklyCostByKeyword[keyword.id]?.[label] || 0;
    });
  });

  return totals;
}, [biweeklyCostByKeyword, biweeklyIntervals, filteredKeywords]);





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

		    {/*}<button
		        onClick={() => runPositionCheck(editableProject.id)}
		        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
		      >
		        <BarChart3 className="w-4 h-4" />
		        Проверить сейчас
		    </button>*/}
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
            <div className="text-3xl font-bold text-green-600 mb-1">{uniqueKeywordsWithTop1to3.size}</div>
            <div className="text-sm text-gray-600">из {editableProject.keywords.length} запросов</div>
          </div>

           <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Star  className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">В ТОП-5</span>
            </div>
            <div className="text-3xl font-bold text-green-600 mb-1">{uniqueKeywordsWithTop4to5.size}</div>
            <div className="text-sm text-gray-600">из {editableProject.keywords.length} запросов</div>
          </div>

          <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Minus className="w-6 h-6 text-yellow-600" />
              <span className="text-sm font-medium text-gray-700">В ТОП-10</span>
            </div>
            <div className="text-3xl font-bold text-yellow-600 mb-1">{uniqueKeywordsWithTop6to10.size}</div>
            <div className="text-sm text-gray-600">из {editableProject.keywords.length} запросов</div>
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
			    <th className="sticky left-0 bg-gray-50 z-20 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[150px] max-w-[400px] border-r border-gray-200">
			      Ключевой запрос
			    </th>
			    <th className="sticky left-[150px] bg-gray-50 z-20 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[100px] max-w-[250px] border-r border-gray-200">
			      Регион
			    </th>

			    {filter.period === 'week' && headerDates.map(date => (
			      <th
			        key={date.toISOString()}
			        className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[70px]"
			      >
			        {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
			      </th>
			    ))}

			    {filter.period === 'month' && dateGroups.map((group, idx) => (
			      <React.Fragment key={idx}>
			        {group.map(date => (
			          <th
			            key={date.toISOString()}
			            className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[70px]"
			          >
			            {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
			          </th>
			        ))}
			        <th
			          key={`sum-${idx}`}
			          className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]"
			        >
			          Сумма за 14 дней
			        </th>
			      </React.Fragment>
			    ))}
			  </tr>
			</thead>


	        <tbody>
			  {filteredKeywords.map(keyword => {
			    const posByDate = positionsMap[keyword.id] || {};
			    return (
			      <tr key={keyword.id} className="hover:bg-gray-50">
			        <td className="sticky left-0 bg-white z-10 px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[150px] max-w-[400px] border-r border-gray-200">
			          {keyword.keyword}
			        </td>
			        <td className="sticky left-[150px] bg-white z-10 px-4 py-3 whitespace-nowrap text-sm text-gray-700 min-w-[100px] max-w-[250px] border-r border-gray-200">
			          {keyword.region}
			        </td>

			        {filter.period === 'month' ? (
					  dateGroups.map((group, idx) => {
					    let groupSum = 0;
					    // Формируем label для интервала, чтобы получить сумму из intervalSums
					    const intervalLabel = `${group[0].toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} - ${group[group.length - 1].toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`;

					    return (
					      <React.Fragment key={idx}>
					        {group.map(date => {
					          const dateKey = formatDateKey(date);
					          const pos = posByDate[dateKey];
					          if (pos && pos.position) {
					            if (pos.cost) groupSum += pos.cost;
					            return (
					              <td key={dateKey} className="px-3 py-2 text-center text-sm">
					                <div className="flex flex-col items-center gap-1">
					                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPositionColor(pos.position)}`}>
					                    #{pos.position}
					                  </span>
					                  <span className={`text-xs ${getTrendColor(pos.trend)}`} title="Динамика позиции">
					                    {getTrendIcon(pos.trend)}
					                  </span>
					                  <span className="text-xs text-gray-700">{pos.cost ? `${pos.cost} ₽` : '—'}</span>
					                </div>
					              </td>
					            );
					          }
					          return (
					            <td key={dateKey} className="px-3 py-2 text-center text-sm text-gray-400">—</td>
					          );
					        })}
					        <td key={`sum-${idx}`} className="px-3 py-2 text-center text-sm font-semibold text-gray-900">
					          {/* Используем сумму из intervalSums, если есть */}
					          {intervalSums[keyword.id]?.[intervalLabel] !== undefined ? `${intervalSums[keyword.id][intervalLabel]} ₽` : (groupSum > 0 ? `${groupSum} ₽` : '—')}
					        </td>
					      </React.Fragment>
					    );
					  })
					) : (
					  // Для периода "week" просто выводим по датам
					  dates.map(date => {
					    const dateKey = formatDateKey(date);
					    const pos = posByDate[dateKey];
					    if (pos && pos.position) {
					      return (
					        <td key={dateKey} className="px-3 py-2 text-center text-sm">
					          <div className="flex flex-col items-center gap-1">
					            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPositionColor(pos.position)}`}>
					              #{pos.position}
					            </span>
					            <span className={`text-xs ${getTrendColor(pos.trend)}`} title="Динамика позиции">
					              {getTrendIcon(pos.trend)}
					            </span>
					            <span className="text-xs text-gray-700">{pos.cost ? `${pos.cost} ₽` : '—'}</span>
					          </div>
					        </td>
					      );
					    }
					    return (
					      <td key={dateKey} className="px-3 py-2 text-center text-sm text-gray-400">—</td>
					    );
					  })
					)}

			      </tr>
			    );
			  })}
			</tbody>


	        <tfoot>
			  <tr className="bg-gray-100 font-semibold">
			    <td className="sticky left-0 bg-gray-100 px-4 py-2 border-r border-gray-200 min-w-[150px] max-w-[400px]">
			      Итого
			    </td>
			    <td className="sticky left-[150px] bg-gray-100 px-4 py-2 border-r border-gray-200 min-w-[100px] max-w-[250px]" />

			    {(filter.period === 'month' ? dateGroups : [dates]).map((group, idx) => {
			      let groupTotal = 0;

			      const dayCells = group.map(date => {
			        const dateKey = formatDateKey(date);
			        let totalCost = 0;

			        filteredKeywords.forEach(keyword => {
			          const posByDate = positionsMap[keyword.id] || {};
			          const pos = posByDate[dateKey];
			          if (pos && pos.cost) {
			            totalCost += pos.cost;
			          }
			        });

			        groupTotal += totalCost;

			        return (
			          <td key={dateKey} className="px-3 py-2 text-center text-sm text-gray-900 min-w-[70px]">
			            {totalCost > 0 ? `${totalCost} ₽` : '—'}
			          </td>
			        );
			      });

			      return (
			        <React.Fragment key={idx}>
			          {dayCells}
			          {filter.period === 'month' && (
			            <td
			              key={`total-sum-${idx}`}
			              className="px-3 py-2 text-center text-sm font-semibold text-gray-900 min-w-[100px]"
			            >
			              {groupTotal > 0 ? `${groupTotal} ₽` : '—'}
			            </td>
			          )}
			        </React.Fragment>
			      );
			    })}
			  </tr>
			</tfoot>


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
