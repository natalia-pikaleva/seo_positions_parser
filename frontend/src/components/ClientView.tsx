import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, Calendar, TrendingUp, Minus, Star } from 'lucide-react';
import { Project, FilterOptions, Position } from '../types';
import { getPositionColor, getTrendIcon, getTrendColor } from '../utils/positionUtils';
import { fetchPositions } from '../utils/api';
import logo  from '../assets/logo.png';

interface ClientViewProps {
  project: Project;
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
    const year = today.getFullYear();
    const month = today.getMonth() + offset;

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      d.setHours(0, 0, 0, 0);
      dates.push(d);
    }
  }
  // Для custom пока возвращаем пустой массив или реализуем отдельно
  return dates;
}


export const ClientView: React.FC<ClientViewProps> = ({ project }) => {
  const [filter, setFilter] = useState<FilterOptions>({ period: 'week' });
  const [positions, setPositions] = useState<Position[]>([]);
  const [keywordFilter, setKeywordFilter] = useState('');
  const [periodOffset, setPeriodOffset] = useState(0);


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


  // Массив дат для заголовков столбцов
  const dates = useMemo(() => getDatesForPeriod(filter.period, periodOffset), [filter.period, periodOffset]);

  const formatDateKey = (date: Date): string => {
	  const year = date.getFullYear();
	  const month = (date.getMonth() + 1).toString().padStart(2, '0');
	  const day = date.getDate().toString().padStart(2, '0');
	  return `${year}-${month}-${day}`;
	};


  // Группируем позиции по ключевым словам и дате (дата в формате yyyy-mm-dd)
  const positionsMap = useMemo(() => {
	  const map: Record<string, Record<string, Position>> = {};
	  positions.forEach(pos => {
	    if (!map[pos.keyword_id]) {
	      map[pos.keyword_id] = {};
	    }
	    const dateKey = formatDateKey(new Date(pos.checked_at));
	    map[pos.keyword_id][dateKey] = pos;
	  });
	  return map;
	}, [positions]);


  // Фильтрация ключевых слов по фильтру
  const filteredKeywords = useMemo(() => {
    return project.keywords.filter(keyword =>
      keyword.keyword.toLowerCase().includes(keywordFilter.toLowerCase())
    );
  }, [project.keywords, keywordFilter]);

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
          <div className="overflow-x-auto" style={{ maxWidth: '100vw' }}>
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
				  {dates.map(date => {
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
					  {dates.map(date => {
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
					          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPositionColor(pos.position)}`}>
					            {pos.position ? `#${pos.position}` : '—'}
					          </span>
					          <span className={`text-xs ${getTrendColor(pos.trend)}`} title="Динамика позиции">
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
      </div>
    </div>
  );
};