import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, TrendingUp, Minus, Copy, Calendar, Star, Edit2 } from 'lucide-react';

import { Group, FilterOptions, Position } from '../types';
import {
  fetchPositions,
  fetchPositionsIntervals,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  runProjectParsing,
  fetchGroup,
  uploadKeywordsFile,
  updateKeywordsFromFile
} from '../utils/api';
import { getPositionColor, getTrendIcon, getTrendColor } from '../utils/positionUtils';
import { KeywordManager } from './KeywordManager';
import { EditGroupMenu } from './EditGroupMenu';

// Импортируем выделенные компоненты
import { PositionFilters } from './PositionFilters';
import { PositionStats } from './PositionStats';
import { PositionTableView } from './PositionTableView';
import { ExcelLikeTableView } from './ExcelLikeTableView'

interface PositionTableProps {
  group: Group;
  onGroupLoaded: (group: Group) => void;
  onUpdateGroup: (group: Group) => void;
  isClientView?: boolean;
  domain?: string;
  groups: Group[];
  onBackToProjectGroups?: () => void;
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
  group,
  onGroupLoaded,
  onUpdateGroup,
  isClientView = false,
  domain,
  groups,
  onBackToProjectGroups,
}) => {
  const [periodOffset, setPeriodOffset] = useState(0);
  const [filter, setFilter] = useState<FilterOptions>({ period: 'month' });
  const [intervalSums, setIntervalSums] = useState<Record<string, Record<string, number>>>({});
  const [editableGroup, setEditableGroup] = useState<Group>(group);
  const [isEditGroupOpen, setIsEditGroupOpen] = useState(false);
  const [groupCreatedAt, setGroupCreatedAt] = useState<Date | null>(null);
  const [keywordFilter, setKeywordFilter] = useState('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [serverIntervals, setServerIntervals] = useState< { dates: Date[]; startDate: string; endDate: string }[] >([]);
  const [parsing, setParsing] = useState(false);
  const [parsingMsg, setParsingMsg] = useState<string | null>(null);

  // Объединяем ключевые слова из всех групп в один массив при клиентском режиме:
  const aggregatedKeywords = useMemo(() => {
    if (!isClientView || !groups || groups.length === 0) return group.keywords || [];

    const keywordsMap: Record<string, typeof groups[0]['keywords'][0]> = {};
    groups.forEach(g => {
      g.keywords.forEach(k => {
        keywordsMap[k.id] = k;
      });
    });
    return Object.values(keywordsMap);
  }, [isClientView, groups, group.keywords]);

  // Формируем агрегированную "группу" для рендера
  const aggregatedGroup = useMemo(() => {
    if (!isClientView) return group;

    const firstGroup = groups && groups.length > 0 ? groups[0] : null;

    return {
      ...firstGroup,
      id: 0, // произвольный id
      keywords: aggregatedKeywords,
    } as Group;
  }, [isClientView, groups, aggregatedKeywords, group]);

  const displayGroup = isClientView ? aggregatedGroup : editableGroup;

  useEffect(() => {
    async function loadPositions() {
      if (isClientView && groups && groups.length > 0) {
        try {
          const results = await Promise.all(
            groups.map(g => fetchPositions(g.id, filter.period, periodOffset))
          );
          setPositions(results.flat());
        } catch (error) {
          console.error('Ошибка загрузки позиций для клиента', error);
          setPositions([]);
        }
      } else if (group?.id) {
        try {
          const data = await fetchPositions(group.id, filter.period, periodOffset);
          setPositions(data);
        } catch (error) {
          console.error('Ошибка загрузки позиций', error);
          setPositions([]);
        }
      }
    }
    loadPositions();
  }, [group?.id, groups, filter.period, periodOffset, isClientView]);


  async function loadIntervalSums() {
	  if (isClientView && groups && groups.length > 0) {
	    try {
	      // Запросы по всем группам, результат - массив data для каждой группы
	      const results = await Promise.all(
	        groups.map(g => fetchPositionsIntervals(g.id, filter.period, periodOffset))
	      );

	      // Формируем общий intervalSums
	      const sumsMap: Record<string, Record<string, IntervalSumData>> = {};

	      results.forEach(data => {
	        data.forEach(({ keyword_id, intervals }) => {
	          if (!sumsMap[keyword_id]) sumsMap[keyword_id] = {};
	          intervals.forEach(interval => {
	            const label = `${interval.start_date} - ${interval.end_date}`;
	            sumsMap[keyword_id][label] = {
	              daysTop3: interval.days_top3 ?? 0,
	              costTop3: interval.cost_top3 ?? 0,
	              daysTop5: interval.days_top5 ?? 0,
	              costTop5: interval.cost_top5 ?? 0,
	              daysTop10: interval.days_top10 ?? 0,
	              costTop10: interval.cost_top10 ?? 0,
	              sumCost: interval.sum_cost ?? 0,
	            };
	          });
	        });
	      });

	      setIntervalSums(sumsMap);

	      // Формируем serverIntervals из интервалов первого keyword_id первой группы (примерно так)
	      // Можно взять интервалы из первой группы в results
	      if (results.length > 0 && results[0].length > 0 && results[0][0].intervals.length > 0) {
	        // Используем интервалы из первой группы вручную для serverIntervals
	        const intervalsGroups = results[0][0].intervals.map(interval => {
	          const start = new Date(interval.display_start_date ?? interval.start_date);
	          const end = new Date(interval.display_end_date ?? interval.end_date);
	          const dates: Date[] = [];
	          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
	            dates.push(new Date(d));
	          }
	          return {
	            dates,
	            startDate: interval.start_date,
	            endDate: interval.end_date,
	            label: `${interval.start_date} - ${interval.end_date}`,
	            displayLabel: `${start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`,
	          };
	        }).filter(group => group.dates.length > 0);
	        setServerIntervals(intervalsGroups);
	      } else {
	        setServerIntervals([]);
	      }

	    } catch (error) {
	      console.error('Ошибка загрузки интервалов для клиента:', error);
	      setIntervalSums({});
	      setServerIntervals([]);
	    }
	  } else if (group?.id) {
	    // Твоя текущая реализация для одиночной группы — можно оставить как есть
	    try {
	      const data = await fetchPositionsIntervals(group.id, filter.period, periodOffset);

	      const sumsMap: Record<string, Record<string, IntervalSumData>> = {};
	      data.forEach(({ keyword_id, intervals }) => {
	        sumsMap[keyword_id] = {};
	        intervals.forEach(interval => {
	          const label = `${interval.start_date} - ${interval.end_date}`;
	          sumsMap[keyword_id][label] = {
	            daysTop3: interval.days_top3 ?? 0,
	            costTop3: interval.cost_top3 ?? 0,
	            daysTop5: interval.days_top5 ?? 0,
	            costTop5: interval.cost_top5 ?? 0,
	            daysTop10: interval.days_top10 ?? 0,
	            costTop10: interval.cost_top10 ?? 0,
	            sumCost: interval.sum_cost ?? 0,
	          };
	        });
	      });
	      setIntervalSums(sumsMap);

	      if (data.length > 0 && data[0].intervals.length > 0) {
	        const intervalsGroups = data[0].intervals.map(interval => {
	          const start = new Date(interval.display_start_date ?? interval.start_date);
	          const end = new Date(interval.display_end_date ?? interval.end_date);
	          const dates: Date[] = [];
	          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
	            dates.push(new Date(d));
	          }
	          return {
	            dates,
	            startDate: interval.start_date,
	            endDate: interval.end_date,
	            label: `${interval.start_date} - ${interval.end_date}`,
	            displayLabel: `${start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`,
	          };
	        }).filter(group => group.dates.length > 0);
	        setServerIntervals(intervalsGroups);
	      } else {
	        setServerIntervals([]);
	      }
	    } catch (error) {
	      console.error('Ошибка загрузки интервалов:', error);
	      setIntervalSums({});
	      setServerIntervals([]);
	    }
	  }
	}

  useEffect(() => {
    loadIntervalSums();
  }, [group?.id, groups, filter.period, periodOffset, isClientView]);

  useEffect(() => {
	  console.log('serverIntervals:', serverIntervals);
	}, [serverIntervals]);

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
	  if (filter.period !== 'month' || !groupCreatedAt) return [];

	  const monthStart = dates[0];
	  const monthEnd = dates[dates.length - 1];

	  // Генерируем интервалы от даты старта до конца текущего месяца
	  const allIntervals = generateBiweeklyIntervalsFromStart(groupCreatedAt, monthEnd);

	  // Фильтруем интервалы, чтобы оставить только те, что пересекаются с текущим месяцем
	  return allIntervals.filter(interval =>
	    interval.endDate >= monthStart && interval.startDate <= monthEnd
	  );
	}, [filter.period, groupCreatedAt, dates]);

  useEffect(() => {
	  if (!isClientView) {
	    setEditableGroup(group);
	  }
	}, [group, isClientView]);

  interface IntervalSumData {
	  daysTop3: number;
	  costTop3: number;
	  daysTop5: number;
	  costTop5: number;
	  daysTop10: number;
	  costTop10: number;
	  sumCost: number;
	}

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

  // Формируем понятный label, например "15.07 - 28.07"
  const label = `${group.startDate} - ${group.endDate}`; // ISO формат, ключ для intervalSums
  const displayLabel = `${start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`;

  return { ...group,
	  isLastPartial,
	  label: `${group.startDate} - ${group.endDate}`,  // ISO-формат ключа!!!
      displayLabel: `${new Date(group.startDate).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit'})} - ${new Date(group.endDate).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit'})}`, };
}).filter(group => {
  if (!group.dates || group.dates.length === 0) return false;

  if (group.isLastPartial) return true;

  const start = new Date(group.startDate);
  const end = new Date(group.endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
  return diffDays >= 14;
});

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
    return displayGroup.keywords.filter(k =>
	    k.keyword.toLowerCase().includes(keywordFilter.toLowerCase())
	  );
	}, [displayGroup.keywords, keywordFilter]);


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

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
	  if (e.target.files?.length) {
	    const file = e.target.files[0];
	    setUploadError(null);
	    setUploading(true);
	    try {
	      // Загрузка файла на бекенд
	      await uploadKeywordsFile(editableGroup.id, file);
	      // После успешной загрузки обновляем группу с ключами
	      const refreshedGroup = await fetchGroup(editableGroup.id);
	      setEditableGroup(refreshedGroup);
	      onGroupLoaded(refreshedGroup);
	    } catch (error: any) {
	      setUploadError(error.message || 'Ошибка загрузки файла');
	    } finally {
	      setUploading(false);
	      // Очистить input, чтобы можно было загрузить тот же файл заново, если нужно
	      if (fileInputRef.current) {
	        fileInputRef.current.value = '';
	      }
	    }
	  }
	};

  const openFileDialog = () => {
	  if (fileInputRef.current) {
	    fileInputRef.current.click();
	  }
	};

  const updateFileInputRef = React.useRef<HTMLInputElement>(null);

  // Обработчик клика кнопки "Обновить ключи из файла"
  const openUpdateFileDialog = () => {
	  if (updateFileInputRef.current) {
	    updateFileInputRef.current.click();
	  }
	};

  // Обработчик выбора файла для обновления
  const handleUpdateFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files?.length) {
    const file = e.target.files[0];
    try {
      setUploadError(null);
      setUploading(true);

      // Вызываем функцию обновления с новым эндпоинтом
      const result = await updateKeywordsFromFile(editableGroup.id, file);

      // По желанию, можно обновить группу с сервера, чтобы обновить UI
      const refreshedGroup = await fetchGroup(editableGroup.id);
      setEditableGroup(refreshedGroup);
      onGroupLoaded(refreshedGroup);

      alert(`Обновлено ключевых слов: ${result.updated_count}`);
    } catch (error: any) {
      setUploadError(error.message || 'Ошибка обновления ключей');
    } finally {
      setUploading(false);
      if (updateFileInputRef.current) updateFileInputRef.current.value = '';
    }
  }
};



  return (

    <div className="space-y-6 flex flex-col h-[80vh]">
      {/* Заголовок и кнопки */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
		  <div className="flex items-center gap-3">
		    <BarChart3 className="w-6 h-6 text-blue-600" />
            <div>
		      <h2 className="text-2xl font-bold text-gray-900 flex flex-wrap items-center gap-2">
		        <span>{domain}</span>
			      { !isClientView && (
			        <>
			          <span className="hidden sm:inline text-gray-500">•</span>
			          <span className="w-full sm:w-auto">{editableGroup.title}</span>
			        </>
			      )}
		      </h2>


		      <p className="text-gray-600">{editableGroup.searchEngine}
		      <span className="sm:inline text-gray-500"> • </span> {editableGroup.region}
		      </p>
		    </div>
		  </div>
		  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full md:w-auto">
		    {!isClientView && (
			  <>
			    <button
			    onClick={() => setIsEditGroupOpen(true)}
			    className="w-full sm:w-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
			    >
			      <Edit2 className="w-4 h-4" />
			        Редактировать группу
			    </button>
			    <button
			      onClick={openFileDialog}
			      disabled={uploading}
			      className="w-full sm:w-auto flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
			    >
			      Загрузить новые ключи из файла
			    </button>
			    <input
			      type="file"
			      accept=".xlsx,.xls"
			      ref={fileInputRef}
			      onChange={handleFileChange}
			      style={{ display: 'none' }}
			    />
			    <button
				  onClick={openUpdateFileDialog}
				  className="w-full sm:w-auto flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors"
				>
				  Обновить ключи из файла
				</button>
				<input
				  type="file"
				  accept=".xlsx,.xls"
				  ref={updateFileInputRef}
				  onChange={handleUpdateFileChange}
				  style={{ display: 'none' }}
				/>



			    {uploading && <p className="text-sm text-gray-600 mt-2">Загрузка файла...</p>}
			    {uploadError && <p className="text-sm text-red-600 mt-2">{uploadError}</p>}
			  </>
			)}

		  </div>
		</div>


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
        {/*<PositionTableView
          editableGroup={editableGroup}
          filteredKeywords={filteredKeywords}
          positionsMap={positionsMap}
          dates={dates}
          headerDates={headerDates}
          dateGroups={extendedDateGroups}
          filterPeriod={filter.period}
          intervalSums={intervalSums}
          formatDateKey={formatDateKey}
        />*/}

        {/* Таблица данных в виде Эксель */}
        <div className="flex-shrink-0 h-1/2 min-h-0 overflow-auto">
	        <ExcelLikeTableView
			  domain={displayGroup.domain}
		      positions={positions}
		      keywords={displayGroup.keywords}
		      intervalSums={intervalSums}
		      dateGroups={extendedDateGroups}
		      isClientView={isClientView}
		      filterPeriod={filter.period}
              periodOffset={periodOffset}
              onBackToProjectGroups={onBackToProjectGroups}
			/>

		</div>

        {/* Работа с ключевыми запросами */}
        <div className="mb-6 flex flex-col h-full min-h-0">
		  {!isClientView && (
			  <KeywordManager
			  keywords={editableGroup.keywords}
			  groups={groups || []}
			  onAddKeyword={async (keywordData) => {
			    const newKeyword = await createKeyword(editableGroup.id, keywordData);
			    const refreshedGroup = await fetchGroup(editableGroup.id);
			    setEditableGroup(refreshedGroup);
                onGroupLoaded(refreshedGroup);
			  }}
			  onUpdateKeyword={async (id, keywordData) => {
				  const updatedKeyword = await updateKeyword(editableGroup.id, id, keywordData);

				  // Сделать fetch обновлённой группы с бэкенда
				  const refreshedGroup = await fetchGroup(editableGroup.id);

				  setEditableGroup(refreshedGroup);
				  onGroupLoaded(refreshedGroup);
				}}

			  onDeleteKeyword={async (id) => {
			    await deleteKeyword(editableGroup.id, id);
			    const updatedKeywords = editableGroup.keywords.filter(k => k.id !== id);
			    onGroupLoaded({ ...editableGroup, keywords: updatedKeywords });
			    setEditableGroup(prev => prev ? {...prev, keywords: updatedKeywords} : prev);
			  }}
		      onBackToProjectGroups={onBackToProjectGroups}
			/>

		  )}

	     </div>



        {!isClientView && isEditGroupOpen && (
          <EditGroupMenu
            group={editableGroup}
            onClose={() => setIsEditGroupOpen(false)}
            onSave={(updatedGroup) => {
              setEditableGroup(updatedGroup);
              onUpdateGroup(updatedGroup);
              setIsEditGroupOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default PositionTable;