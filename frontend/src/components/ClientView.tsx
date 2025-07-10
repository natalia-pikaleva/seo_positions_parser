import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, Calendar, TrendingUp, Minus, Star } from 'lucide-react';
import { Project, FilterOptions, Position } from '../types';
import { getPositionColor, getTrendIcon, getTrendColor } from '../utils/positionUtils';
import { fetchPositions, fetchPositionsIntervals } from '../utils/api';
import logo  from '../assets/logo.png';
import { PositionTableView } from './PositionTableView';

interface ClientViewProps {
  project: Project;
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


export const ClientView: React.FC<ClientViewProps> = ({ project }) => {
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



  useEffect(() => {
	  if (project.createdAt) {
	    setProjectCreatedAt(new Date(project.createdAt));
	  } else if (project.created_at) {
	    setProjectCreatedAt(new Date(project.created_at));
	  } else {
	    // Если даты нет, можно взять первый день текущего месяца
	    const today = new Date();
	    setProjectCreatedAt(new Date(today.getFullYear(), today.getMonth(), 1));
	  }
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



  useEffect(() => {
	  if (!project?.id) return;

	  async function loadPositions() {
	    try {
	      // Передаём periodOffset в API, если поддерживается
	      const data = await fetchPositions(project.id, filter.period, periodOffset);
	      setPositions(data);
	    } catch (error) {
	      console.error('Ошибка загрузки позиций', error);
	    }
	  }
	  loadPositions();
	}, [project?.id, filter.period, periodOffset]);

  useEffect(() => {
  if (!project?.id || filter.period !== 'month') {
    setIntervalSums({});
    setServerIntervals([]);
    return;
  }

  async function loadIntervalSums() {
    try {
      const data = await fetchPositionsIntervals(project.id, filter.period, periodOffset);
      const sumsMap: Record<string, Record<string, number>> = {};
      data.forEach(({ keyword_id, intervals }) => {
        sumsMap[keyword_id] = {};
        intervals.forEach(({ start_date, end_date, sum_cost }) => {
          const label = `${start_date} - ${end_date}`;
          sumsMap[keyword_id][label] = sum_cost;
        });
      });
      setIntervalSums(sumsMap);

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
      console.error('Ошибка загрузки сумм по интервалам', error);
      setServerIntervals([]);
    }
  }
  loadIntervalSums();
}, [project?.id, filter.period, periodOffset]);




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
	  console.log('dates:', dates);
	  console.log('biweeklyIntervals:', biweeklyIntervals);
	  console.log('dateGroups:', dateGroups);
	}, [projectCreatedAt, dates, biweeklyIntervals, dateGroups]);




  // Загрузка агрегированных сумм по интервалам
  useEffect(() => {
    if (!project?.id || filter.period !== 'month') {
      setIntervalSums({});
      return;
    }
    async function loadIntervalSums() {
      try {
        const data = await fetchPositionsIntervals(project.id, filter.period, periodOffset);
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


  //Статистика
  // Ключевые слова в позициях от 1 до 3
	const uniqueKeywordsTop1to3 = useMemo(() => {
	  return new Set(
	    positions
	      .filter(pos => pos.position !== undefined && pos.position >= 1 && pos.position <= 3)
	      .map(pos => pos.keyword_id)
	  );
	}, [positions]);

	// Ключевые слова в позициях от 4 до 5
	const uniqueKeywordsTop4to5 = useMemo(() => {
	  return new Set(
	    positions
	      .filter(pos => pos.position !== undefined && pos.position >= 4 && pos.position <= 5)
	      .map(pos => pos.keyword_id)
	  );
	}, [positions]);

	// Ключевые слова в позициях от 6 до 10
	const uniqueKeywordsTop6to10 = useMemo(() => {
	  return new Set(
	    positions
	      .filter(pos => pos.position !== undefined && pos.position >= 6 && pos.position <= 10)
	      .map(pos => pos.keyword_id)
	  );
	}, [positions]);


  const latestCheckDate = useMemo(() => {
	  if (!positions.length) return null;
	  const dates = positions.map(pos => new Date(pos.checked_at).getTime());
	  const maxTime = Math.max(...dates);
	  return new Date(maxTime);
	}, [positions]);

  useEffect(() => {
	  setPeriodOffset(0);
	}, [filter.period]);

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


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center border-b border-gray-200">
		  <div className="flex items-center space-x-3">
		    <img src={logo}
		      alt="Логотип"
		      className="h-12 w-auto"
		    />
		    <h1 className="text-xl font-bold">SEO Position Parser</h1>
		  </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Заголовок и статистика */}
        <div className="bg-white rounded-lg shadow-lg mb-6">
          <div className="p-6 border-b border-gray-200 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Мониторинг позиций</h1>
              <p className="text-gray-600">{project.domain} • {project.region}</p>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-6 h-6 text-green-600" />
              <span className="text-sm font-medium text-gray-700">В ТОП-3</span>
            </div>
            <div className="text-3xl font-bold text-green-600 mb-1">{uniqueKeywordsTop1to3.size}</div>
            <div className="text-sm text-gray-600">из {project.keywords.length} запросов</div>
          </div>

           <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Star  className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">В ТОП-5</span>
            </div>
            <div className="text-3xl font-bold text-green-600 mb-1">{uniqueKeywordsTop4to5.size}</div>
            <div className="text-sm text-gray-600">из {project.keywords.length} запросов</div>
          </div>

          <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Minus className="w-6 h-6 text-yellow-600" />
              <span className="text-sm font-medium text-gray-700">В ТОП-10</span>
            </div>
            <div className="text-3xl font-bold text-yellow-600 mb-1">{uniqueKeywordsTop6to10.size}</div>
            <div className="text-sm text-gray-600">из {project.keywords.length} запросов</div>
          </div>
        </div>



          {/* Фильтр по периоду и ключевому слову */}
          <div className="flex items-center gap-4 mb-6">
            <select
              value={filter.period}
              onChange={(e) => setFilter({ ...filter, period: e.target.value as FilterOptions['period'] })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

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

        </div>
      </div>
    </div>
  );
};