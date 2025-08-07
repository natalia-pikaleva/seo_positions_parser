import React, { useMemo, useState } from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import useMediaQuery from '@mui/material/useMediaQuery';

import 'react-tabs/style/react-tabs.css';

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

interface PositionOut {
  id: string;
  keyword_id: string;
  checked_at: string;
  position?: number | null;
  cost: number;
}

interface Keyword {
  id: string;
  keyword: string;
  region?: string;
  price_top_1_3?: number;
  price_top_4_5?: number;
  price_top_6_10?: number;
}

interface IntervalGroup {
  label: string;         // Ключ для интервала (ISO-формат, например '2025-07-01 - 2025-07-14')
  displayLabel: string;  // Человекочитаемый (например '01.07 - 14.07')
  startDate: string;     // ISO формат даты
  endDate: string;       // ISO формат даты
  // возможно другие поля
}

interface IntervalSums {
  [keywordId: string]: {
    [intervalLabel: string]: {
      daysTop3: number;
      costTop3: number;
      daysTop5: number;
      costTop5: number;
      daysTop10: number;
      costTop10: number;
    };
  };
}

interface ExcelLikeTableViewProps {
  domain: string;
  positions: PositionOut[];
  keywords: Keyword[];
  intervalSums: IntervalSums;
  dateGroups: IntervalGroup[];
}

function mergeDatesWithIntervals(
  dates: string[],
  intervals: IntervalGroup[]
): { type: 'date' | 'interval'; value: string; interval?: IntervalGroup }[] {
  const result = [];
  let intervalIndex = 0;

  // Массив для хранения на какой индекс вставлять интервалы
  // Найдём для каждого интервала индекс последней даты из dates, попадающей в интервал
  const insertPositions = intervals.map(interval => {
    // Найдем самый большой индекс в dates с датой <= interval.endDate и >= interval.startDate
    let pos = -1;
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] >= interval.startDate && dates[i] <= interval.endDate) {
        pos = i; // Обновляем последний подходящий индекс
      }
    }
    // Если не нашли подходящий, вернём -1 — тогда будем добавлять в конец
    return pos;
  });

  // Индекс текущего интервала для вставки
  let currentIntervalIndex = 0;

  for (let i = 0; i < dates.length; i++) {
    const currentDate = dates[i];
    result.push({ type: 'date', value: currentDate });

    // Вставляем все интервалы, которые должны идти после этой даты
    while (currentIntervalIndex < intervals.length && insertPositions[currentIntervalIndex] === i) {
      const interval = intervals[currentIntervalIndex];
      const displayValue = interval.displayLabel || interval.label || `${interval.startDate} - ${interval.endDate}`;
      result.push({ type: 'interval', value: displayValue, interval });
      currentIntervalIndex++;
    }
  }

  // Добавляем интервалы, для которых подходящей даты не было (insertPositions = -1)
  while (currentIntervalIndex < intervals.length) {
    const interval = intervals[currentIntervalIndex];
    result.push({
      type: 'interval',
      value: interval.displayLabel || interval.label,
      interval,
    });
    currentIntervalIndex++;
  }

  return result;
}

const dataGridHeaderSx = {
  '& .column-header': {
    fontSize: '0.75rem',
    backgroundColor: '#ea580c',
    color: '#fff',
    fontWeight: 'bold',
    whiteSpace: 'normal',          // разрешаем перенос
    lineHeight: 1.2,
    paddingTop: '8px',
    paddingBottom: '8px',
    textAlign: 'center',
  },
  '& .summary-column-header': {
    fontSize: '0.75rem',
    backgroundColor: '#fffdd0',
    color: '#000',
    fontWeight: 'bold',
    whiteSpace: 'normal',
    lineHeight: 1.2,
    paddingTop: '8px',
    paddingBottom: '8px',
    textAlign: 'center',
  },
  // *** Важно: перекрываем стили заголовка для текста ***
  '& .MuiDataGrid-columnHeaderTitle': {
    whiteSpace: 'normal !important',
    overflow: 'visible !important',
    textOverflow: 'clip !important',
    display: 'block',
    lineHeight: 1.2,
    // можно задать максимальную высоту для хранения нескольких строк
    maxHeight: '3.6em', // примерно 3 строки при 1.2 line-height
  },
};




export function ExcelLikeTableView({
  domain,
  positions,
  keywords,
  intervalSums,
  dateGroups,
}: ExcelLikeTableViewProps): JSX.Element {
  const isMobile = useMediaQuery('(max-width:600px)');

  type SortMode = 'none' | 'asc' | 'desc';
  const [sortMode, setSortMode] = useState<SortMode>('none');

  const SortButton = () => {
	  const labelMap = {
	    none: 'Сортировка позиций',
	    asc: 'Сортировка позиций ↑',
	    desc: 'Сортировка позиций ↓',
	  };

	  const nextSortMode = (mode: SortMode): SortMode =>
	    mode === 'none' ? 'asc' : mode === 'asc' ? 'desc' : 'none';

	  return (
	    <button
	      style={{
	        marginBottom: 12,
	        padding: '8px 16px',
	        fontSize: '1rem',

	        cursor: 'pointer',
	        borderRadius: 6,
	        backgroundColor: '#ea580c',
	        color: '#fff',
	        border: 'none',
	      }}
	      onClick={() => setSortMode(nextSortMode(sortMode))}
	      type="button"
	    >
	      {labelMap[sortMode]}
	    </button>
	  );
	};



  // Формируем строки для вкладки "Инфо"
  const infoRows = useMemo(() => {
    return keywords.map((k, index) => ({
      id: k.id,
      serial: index + 1,
      keyword: k.keyword,
      region: k.region || '-',
      cost_top3: k.price_top_1_3 ?? '-',
      cost_top5: k.price_top_4_5 ?? '-',
      cost_top10: k.price_top_6_10 ?? '-',
    }));
  }, [keywords]);

  const commonColumnHeaderStyle = {
	  fontSize: '0.75rem',       // уменьшенный размер шрифта (пример: 12px)
	  backgroundColor: '#ff9800', // оранжевый фон (можно заменить на нужный оттенок)
	  color: '#fff',             // белый цвет текста для контраста
	  fontWeight: 'bold',
	};


  const infoColumns: GridColDef[] = [
	  { field: 'serial', headerName: 'Номер п/п', width: 110, headerClassName: 'column-header' },
	  { field: 'keyword', headerName: 'Ключевой запрос', width: 250, headerClassName: 'column-header' },
	  { field: 'region', headerName: 'Регион', width: 150, headerClassName: 'column-header' },
	  { field: 'cost_top3', headerName: 'Стоимость ТОП3, руб', width: 150, type: 'number', headerClassName: 'column-header' },
	  { field: 'cost_top5', headerName: 'Стоимость ТОП5, руб', width: 150, type: 'number', headerClassName: 'column-header' },
	  { field: 'cost_top10', headerName: 'Стоимость ТОП10, руб', width: 150, type: 'number', headerClassName: 'column-header' },
	];

  // Вертикальные карточки для вкладки "Инфо" для мобильной версии
  const renderInfoCards = () => (
    <div style={{ padding: 8 }}>
      {infoRows.map(row => (
        <div
          key={row.id}
          style={{
            border: '1px solid #ccc',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}
        >
          <div><strong>№:</strong> {row.serial}</div>
          <div><strong>Ключевой запрос:</strong> {row.keyword}</div>
          <div><strong>Регион:</strong> {row.region}</div>
          <div><strong>Стоимость ТОП3:</strong> {row.cost_top3}</div>
          <div><strong>Стоимость ТОП5:</strong> {row.cost_top5}</div>
          <div><strong>Стоимость ТОП10:</strong> {row.cost_top10}</div>
        </div>
      ))}
    </div>
  );

  // Уникальные даты из позиций в формате ISO (YYYY-MM-DD)
  const uniqueDates = useMemo(() => {
    const set = new Set<string>();
    positions.forEach((pos) => set.add(formatDate(pos.checked_at)));
    return Array.from(set).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [positions]);

  // Быстрый доступ к позициям по ключу `${keyword_id}|${date}`
  const positionMap = useMemo(() => {
    const map: Record<string, PositionOut> = {};
    positions.forEach((p) => {
      const key = `${p.keyword_id}|${formatDate(p.checked_at)}`;
      map[key] = p;
    });
    return map;
  }, [positions]);

  // Отобразить дату в формате "31.07"
  function formatDateShort(dateStr: string): string {
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${day}.${month}`;
  }

  function getColumnsForDate(dateStr: string): GridColDef[] {
	  return [
	    { field: 'keyword', headerName: 'Ключевой запрос', width: 250, headerClassName: 'column-header' },
	    {
	      field: 'position',
	      headerName: `Позиция ${formatDateShort(dateStr)}`,
	      width: 120,
	      type: 'number',
	      headerClassName: 'column-header',
	      sortComparator: (v1, v2) => {
	        // Преобразуем значения в числа, если число, иначе NaN
	        const n1 = typeof v1 === 'number' ? v1 : NaN;
	        const n2 = typeof v2 === 'number' ? v2 : NaN;

	        // Если оба числа
	        if (!isNaN(n1) && !isNaN(n2)) {
	          return n1 - n2;
	        }
	        // Если только первое число
	        if (!isNaN(n1) && isNaN(n2)) {
	          // v1 с числом, v2 с "-"
	          return -1; // v1 должен быть перед v2
	        }
	        // Если только второе число
	        if (isNaN(n1) && !isNaN(n2)) {
	          // v1 с "-", v2 с числом
	          return 1; // v1 должен быть после v2
	        }
	        // Если оба не числа (оба "-")
	        return 0;
	      }
	    },
	    { field: 'cost', headerName: 'Стоимость', width: 130, type: 'number', headerClassName: 'column-header' },
	  ];
	}


  // Сформировать строки данных по дате
  const getRowsForDate = (dateStr: string) => {
    return keywords.map((k) => {
      const key = `${k.id}|${dateStr}`;
      const pos = positionMap[key];
      return {
        id: k.id,
        keyword: k.keyword,
        position: pos?.position ?? '-',
        cost: pos?.cost ?? '-',
      };
    });
  };

  // Итоговая стоимость за дату
  const getTotalCostForDate = (dateStr: string) => {
    return keywords.reduce((sum, k) => {
      const key = `${k.id}|${dateStr}`;
      const cost = positionMap[key]?.cost;
      return sum + (typeof cost === 'number' ? cost : 0);
    }, 0);
  };

  // Колонки для вкладок с итогами за день
  function getColumnsForDateWithTotal(dateStr: string, totalCost: number): GridColDef[] {
	  return [
	    { field: 'keyword', headerName: 'Ключевой запрос', width: 250, headerClassName: 'column-header' },
	    {
	      field: 'position',
	      headerName: `Позиция ${formatDateShort(dateStr)}`,
	      width: 120,
	      type: 'number',
	      headerClassName: 'column-header',
	      sortComparator: (v1, v2) => {
	        const n1 = typeof v1 === 'number' ? v1 : NaN;
	        const n2 = typeof v2 === 'number' ? v2 : NaN;

	        if (!isNaN(n1) && !isNaN(n2)) return n1 - n2;
	        if (!isNaN(n1) && isNaN(n2)) return -1;
	        if (isNaN(n1) && !isNaN(n2)) return 1;
	        return 0;
	      }
	    },
	    {
	      field: 'cost',
	      headerName: 'Стоимость',
	      width: 130,
	      type: 'number',
	      headerClassName: 'column-header',
	      sortComparator: (v1, v2) => {
	        const n1 = typeof v1 === 'number' ? v1 : NaN;
	        const n2 = typeof v2 === 'number' ? v2 : NaN;

	        if (!isNaN(n1) && !isNaN(n2)) return n1 - n2;
	        if (!isNaN(n1) && isNaN(n2)) return -1;
	        if (isNaN(n1) && !isNaN(n2)) return 1;
	        return 0;
	      }
	    },
	    {
	      field: 'totalCost',
	      headerName: `Итог за день: ${totalCost}`,
	      width: 150,
	      renderCell: () => null,
	      sortable: false,
	      filterable: false,
	      disableColumnMenu: true,
	      headerClassName: 'summary-column-header'
	    },
	  ];
	}



  // Вертикальные карточки для таба с конкретной датой
  function renderDateCards(dateStr: string) {
	  const totalCost = getTotalCostForDate(dateStr);

	  // Получаем массив карточек с позициями
	  let cards = keywords.map(k => {
	    const pos = positions.find(p => p.keyword_id === k.id && formatDate(p.checked_at) === dateStr);
	    return {
	      ...k,
	      position: pos?.position ?? null,
	      posValue: pos?.position, // для сортировки
	      cost: pos?.cost ?? '-',
	    };
	  });

	  // Сортируем если требуется
	  if (sortMode === 'asc') {
	    cards = cards.slice().sort((a, b) => {
	      if (a.position === null && b.position === null) return 0;
	      if (a.position === null) return 1;
	      if (b.position === null) return -1;
	      return a.position - b.position;
	    });
	  } else if (sortMode === 'desc') {
	    cards = cards.slice().sort((a, b) => {
	      if (a.position === null && b.position === null) return 0;
	      if (a.position === null) return 1;
	      if (b.position === null) return -1;
	      return b.position - a.position;
	    });
	  }

	  return (
		  <div style={{ padding: 8 }}>
		    {/* Контейнер только для кнопки сортировки, кнопка справа */}
		    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
		      <SortButton />
		    </div>

		    {/* Заголовок ниже, по центру */}
		    <div style={{
		      fontWeight: 'bold',
		      fontSize: '1.1rem',
		      padding: '8px 12px',
		      marginBottom: 12,
		      backgroundColor: '#fffdd0',
		      borderRadius: 8,
		      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
		      textAlign: 'center'
		    }}>
		      Итог за {formatDateShort(dateStr)}: {totalCost.toLocaleString('ru-RU')} руб.
		    </div>

		    {/* Карточки */}
		    {cards.map(k => (
		      <div
		        key={k.id}
		        style={{
		          border: '1px solid #ccc',
		          borderRadius: 8,
		          padding: 12,
		          marginBottom: 12,
		          background: '#fff',
		          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
		        }}
		      >
		        <div><strong>Ключевой запрос: {k.keyword} </strong></div>
		        <div>Позиция: {k.position ?? '-'}</div>
		        <div>Стоимость: {k.cost ?? '-'}</div>
		      </div>
		    ))}
		  </div>
		);

	}


  // Колонки для вкладок с итогами за 14-дневные периоды
  function getColumnsForIntervalWithSummary(totalSum: number): GridColDef[] {
	  return [
	    { field: 'serial', headerName: '№', width: 80, headerClassName: 'column-header' },
	    { field: 'keyword', headerName: 'Ключевой запрос', width: 280, headerClassName: 'column-header' },
	    { field: 'daysTop3', headerName: 'ТОП-3 кол-во', width: 100, type: 'number', headerClassName: 'column-header' },
	    { field: 'costTop3', headerName: 'Стоимость ТОП-3', width: 100, type: 'number', headerClassName: 'column-header' },
	    { field: 'daysTop5', headerName: 'ТОП-5 кол-во', width: 100, type: 'number', headerClassName: 'column-header' },
	    { field: 'costTop5', headerName: 'Стоимость ТОП-5', width: 100, type: 'number', headerClassName: 'column-header' },
	    { field: 'daysTop10', headerName: 'ТОП-10 кол-во', width: 100, type: 'number', headerClassName: 'column-header' },
	    { field: 'costTop10', headerName: 'Стоимость ТОП-10', width: 100, type: 'number', headerClassName: 'column-header' },
	    {
	      field: 'totalCost',
	      headerName: 'Итог по ключевому запросу',
	      width: 105,
	      type: 'number',
	      headerClassName: 'column-header',
	    },
	    {
	      field: 'totalSummary',
	      headerName: `Итого за 2 недели: ${totalSum.toLocaleString('ru-RU')} руб.`,
	      width: 130,
	      sortable: false,
	      filterable: false,
	      disableColumnMenu: true,
	      headerClassName: 'summary-column-header',
	      renderCell: () => null, // Чтобы ячейки пустые были
	    },
	  ];
	}

  // Формирование строк для вкладок итогов по интервалам
  const getRowsByInterval = (intervalLabel: string) => {
    return keywords.map((kw, index) => {
      const data = intervalSums?.[kw.id]?.[intervalLabel] || {};
      console.log('Keyword:', kw.id, 'Interval:', intervalLabel, 'Data:', data);

      const daysTop3 = data.daysTop3 ?? 0;
      const costTop3 = data.costTop3 ?? 0;
      const daysTop5 = data.daysTop5 ?? 0;
      const costTop5 = data.costTop5 ?? 0;
      const daysTop10 = data.daysTop10 ?? 0;
      const costTop10 = data.costTop10 ?? 0;


      const totalCost = data.sumCost ?? 0;

      return {
        id: kw.id,
        serial: index + 1,
        keyword: kw.keyword,
        daysTop3,
        costTop3,
        daysTop5,
        costTop5,
        daysTop10,
        costTop10,
        totalCost,
      };
    });
  };

  // Объединяем даты и интервалы игрока с местом вставки итогов после каждой даты интервала
  const mergedTabs = useMemo(() => mergeDatesWithIntervals(uniqueDates, dateGroups), [uniqueDates, dateGroups]);

  // Состояние выбраной вкладки — изначально null (или 0)
  const [selectedTab, setSelectedTab] = useState<number>(0);

  // Когда mergedTabs обновится, выставляем выбранную вкладку на последнюю
  React.useEffect(() => {
	  setSelectedTab(mergedTabs.length); // "Инфо" - 0, остальные с 1, значит последняя - mergedTabs.length
	}, [mergedTabs]);


  // Функция для склонения
  function declOfNum(number, titles) {
	  // number - число
	  // titles - массив форм ['день', 'дня', 'дней']
	  const cases = [2, 0, 1, 1, 1, 2];
	  return titles[(number % 100 > 4 && number % 100 < 20)
	    ? 2
	    : cases[(number % 10 < 5) ? number % 10 : 5]];
	}

  // Вариант карточек с итогами за период в формате аккордеона
  function IntervalAccordion({ row }) {
	  const [open, setOpen] = useState(false);

	  const colorTop3 = '#16a34a'; // зеленый
	  const colorTop5 = '#ea580c'; // оранжевый
	  const colorTop10 = '#dc2626'; // красный

	  return (
	    <div
	      style={{
	        border: '1px solid #ccc',
	        borderRadius: 8,
	        marginBottom: 10,
	        background: '#fff',
	        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
	        overflow: 'hidden',
	      }}
	    >
	      <div
				  onClick={() => setOpen(!open)}
				  style={{
				    padding: '12px 16px',
				    cursor: 'pointer',
				    display: 'flex',
				    alignItems: 'center',
				    flexWrap: 'wrap', // разрешаем перенос при нехватке места
				    userSelect: 'none',
				  }}
				>
				  <div
				    style={{
				      fontWeight: 'bold',
				      whiteSpace: 'normal', // разрешаем перенос текста
				      flex: 1,               // занимает всё доступное место
				      minWidth: 0,           // позволяет сжиматься в flex
				    }}
				  >
				    {`${row.serial}. ${row.keyword}`}
				  </div>

				  <div
				    style={{
				      display: 'flex',
				      alignItems: 'center',
				      marginLeft: 'auto',    // сдвигает блок с суммой и стрелкой вправо
				      whiteSpace: 'nowrap',  // сумма и стрелка не переносятся, а лежат в ряд
				    }}
				  >
				    <span style={{ color: '#555', fontWeight: 'bold', marginRight: 12 }}>
				      {row.totalCost.toLocaleString('ru-RU')} руб.
				    </span>
				    <span>{open ? '▲' : '▼'}</span>
				  </div>
				</div>

	      {open && (
	        <div style={{ padding: 12, borderTop: '1px solid #ddd' }}>
	          <div style={{ color: colorTop3, marginBottom: 6 }}>
				  ТОП-3: {row.daysTop3} {declOfNum(row.daysTop3, ['день', 'дня', 'дней'])}, стоимость {row.costTop3} руб.
		      </div>
			  <div style={{ color: colorTop5, marginBottom: 6 }}>
				  ТОП-5: {row.daysTop5} {declOfNum(row.daysTop5, ['день', 'дня', 'дней'])}, стоимость {row.costTop5} руб.
			  </div>
			  <div style={{ color: colorTop10, marginBottom: 6 }}>
				  ТОП-10: {row.daysTop10} {declOfNum(row.daysTop10, ['день', 'дня', 'дней'])}, стоимость {row.costTop10} руб.
			  </div>
	        </div>
	      )}
	    </div>
	  );
	}


  function renderIntervalCards(intervalLabel: string) {
	  const rows = getRowsByInterval(intervalLabel);
	  const totalSumForInterval = rows.reduce((acc, row) => acc + (row.totalCost ?? 0), 0);

	  return (
	    <div>
	      {/* итого */}
	      <div style={{
	          fontWeight: 'bold',
	          fontSize: '1.1rem',
	          padding: '8px 12px',
	          marginBottom: 12,
	          backgroundColor: '#fffdd0',
	          borderRadius: 8,
	          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
	          textAlign: 'center'
	        }}
	      >
	        Итого за 2 недели: {totalSumForInterval.toLocaleString('ru-RU')} руб.
	      </div>
	      {rows.map(row => (
	        <IntervalAccordion key={row.id} row={row} />
	      ))}
	    </div>
	  );
	}


  return (
	  <Tabs selectedIndex={selectedTab} onSelect={setSelectedTab}>
	    {/* Обертка для горизонтального скролла и рендеринга вкладок в ряд */}
	    <div
	      style={{
	        display: 'flex',
	        overflowX: 'auto',
	        whiteSpace: 'nowrap',
	        WebkitOverflowScrolling: 'touch', // плавный скролл на iOS
	      }}
	    >
	      <TabList
	        style={{
	          display: 'flex',
	          flexWrap: 'nowrap', // запрет переноса табов
	          padding: 0,
	          margin: 0,
	        }}
	      >
	        {/* Вкладка "Инфо" */}
	        <Tab
	          key="info"
	          style={{
	            flexShrink: 0,        // таб не сжимается
	            whiteSpace: 'nowrap', // текст не переносится
	          }}
	        >
	          Инфо
	        </Tab>

	        {/* Вкладки по датам и итогам */}
	        {mergedTabs.map((tab, idx) => {
	          // Консоль для отладки
	          console.log(`Rendering Tab #${idx}`, tab.type, tab.value, tab.interval);

	          const tabLabel =
	            tab.type === 'date'
	              ? formatDateShort(tab.value)
	              : tab.interval?.displayLabel || tab.value || 'Неизвестный интервал';

	          return (
	            <Tab
	              key={
	                tab.type === 'date'
	                  ? `date-tab-${tab.value}`
	                  : `interval-tab-${tab.interval?.startDate}-${tab.interval?.endDate}`
	              }
	              style={{
	                flexShrink: 0,
	                whiteSpace: 'nowrap',
	                padding: '8px 16px',
	                cursor: 'pointer',
	                userSelect: 'none',
	              }}
	            >
	              {tabLabel}
	            </Tab>
	          );
	        })}
	      </TabList>
	    </div>

	    {/* Панель "Инфо" */}
	    <TabPanel key="panel-info">
		  {/* Отступ сверху и снизу, увеличенный размер шрифта и жирность */}
		  <div style={{ marginTop: 16, marginBottom: 20 }}>
		    <strong style={{ fontSize: '1.5rem', display: 'inline-block' }}>
		      Сайт: {domain}
		    </strong>
		  </div>

		  {isMobile ? (
	          renderInfoCards()
	        ) : (
	          <div style={{ marginTop: 0, height: 420, width: '100%' }}>
	            <DataGrid
	              rows={infoRows}
	              columns={infoColumns}
	              pageSize={10}
	              rowsPerPageOptions={[10]}
	              disableSelectionOnClick
	              autoHeight
	              sx={dataGridHeaderSx}
	            />
	          </div>
	        )}
		</TabPanel>


	    {/* Панели для вкладок с датами и итогами */}
	    {mergedTabs.map((tab, idx) => {
	        if (tab.type === 'date') {
	          const totalCost = getTotalCostForDate(tab.value);
	          return (
	            <TabPanel key={`date-panel-${tab.value}`}>
	              {isMobile ? (
	                renderDateCards(tab.value)
	              ) : (
	                <DataGrid
	                  rows={getRowsForDate(tab.value)}
	                  columns={getColumnsForDateWithTotal(tab.value, totalCost)}
	                  pageSize={20}
	                  rowsPerPageOptions={[10, 20, 50]}
	                  disableSelectionOnClick
	                  autoHeight
	                  sx={dataGridHeaderSx}
	                />
	              )}
	            </TabPanel>
	          );
	        } else {
	          if (!tab.interval) return null;

	          const intervalKey = tab.interval.label;
	          const rows = getRowsByInterval(intervalKey);
	          const totalSumForInterval = rows.reduce((acc, row) => acc + (row.totalCost ?? 0), 0);

	          return (
	            <TabPanel key={`interval-panel-${intervalKey}`}>
	              {isMobile ? (
	                renderIntervalCards(intervalKey)
	              ) : (
	                <DataGrid
	                  rows={rows}
	                  columns={getColumnsForIntervalWithSummary(totalSumForInterval)}
	                  pageSize={10}
	                  rowsPerPageOptions={[10, 20, 50]}
	                  disableSelectionOnClick
	                  autoHeight
	                  sx={dataGridHeaderSx}
	                />
	              )}
	            </TabPanel>
	          );
	        }
	      })}
	    </Tabs>
	);

}
