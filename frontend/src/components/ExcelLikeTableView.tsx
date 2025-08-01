import React, { useMemo, useState } from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

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
    fontSize: '0.75rem',          // маленький шрифт (~12px)
    backgroundColor: '#ea580c',
    color: '#fff',                // белый цвет текста для контраста
    fontWeight: 'bold',
  },
};



export function ExcelLikeTableView({
  domain,
  positions,
  keywords,
  intervalSums,
  dateGroups,
}: ExcelLikeTableViewProps): JSX.Element {
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
	  { field: 'cost_top3', headerName: 'Стоимость ТОП3, руб', width: 200, type: 'number', headerClassName: 'column-header' },
	  { field: 'cost_top5', headerName: 'Стоимость ТОП5, руб', width: 200, type: 'number', headerClassName: 'column-header' },
	  { field: 'cost_top10', headerName: 'Стоимость ТОП10, руб', width: 200, type: 'number', headerClassName: 'column-header' },
	];

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
      { field: 'keyword', headerName: 'Ключевое слово', width: 250, headerClassName: 'column-header' },
      {
        field: 'position',
        headerName: `Позиция ${formatDateShort(dateStr)}`,
        width: 120,
        type: 'number',
        headerClassName: 'column-header'
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
      { field: 'keyword', headerName: 'Ключевое слово', width: 250, headerClassName: 'column-header' },
      {
        field: 'position',
        headerName: `Позиция ${formatDateShort(dateStr)}`,
        width: 120,
        type: 'number',
        headerClassName: 'column-header'
      },
      {
        field: 'cost',
        headerName: 'Стоимость',
        width: 130,
        type: 'number',
        headerClassName: 'column-header'
      },
      {
        field: 'totalCost',
        headerName: `Итог за день: ${totalCost}`,
        width: 150,
        renderCell: () => null,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        headerClassName: 'column-header'
      },
    ];
  }

  // Колонки для вкладок с итогами за 14-дневные периоды
  function getColumnsForIntervalWithSummary(totalSum: number): GridColDef[] {
	  return [
	    { field: 'serial', headerName: '№', width: 80, headerClassName: 'column-header' },
	    { field: 'keyword', headerName: 'Ключевой запрос', width: 250, headerClassName: 'column-header' },
	    { field: 'daysTop3', headerName: 'ТОП-3 кол-во', width: 100, type: 'number', headerClassName: 'column-header' },
	    { field: 'costTop3', headerName: 'Стоимость ТОП-3', width: 120, type: 'number', headerClassName: 'column-header' },
	    { field: 'daysTop5', headerName: 'ТОП-5 кол-во', width: 100, type: 'number', headerClassName: 'column-header' },
	    { field: 'costTop5', headerName: 'Стоимость ТОП-5', width: 120, type: 'number', headerClassName: 'column-header' },
	    { field: 'daysTop10', headerName: 'ТОП-10 кол-во', width: 100, type: 'number', headerClassName: 'column-header' },
	    { field: 'costTop10', headerName: 'Стоимость ТОП-10', width: 130, type: 'number', headerClassName: 'column-header' },
	    {
	      field: 'totalCost',
	      headerName: 'Итог по ключевому запросу',
	      width: 180,
	      type: 'number',
	      headerClassName: 'column-header',
	      // renderCell не нужен, обычно это число в каждой строке
	    },
	    {
	      field: 'totalSummary',
	      headerName: `Итого за 2 недели: ${totalSum.toLocaleString('ru-RU')} руб.`,
	      width: 200,
	      sortable: false,
	      filterable: false,
	      disableColumnMenu: true,
	      headerClassName: 'column-header',
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

  const [selectedTab, setSelectedTab] = useState(0);

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

		  {/* Отступ сверху перед таблицей, если нужно */}
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
		</TabPanel>


	    {/* Панели для вкладок с датами и итогами */}
	    {mergedTabs.map((tab, idx) => {
	      console.log(`Rendering TabPanel #${idx}`, tab.type, tab.value, tab.interval);

	      if (tab.type === 'date') {
	        const totalCost = getTotalCostForDate(tab.value);
	        return (
	          <TabPanel key={`date-panel-${tab.value}`}>
	            <DataGrid
	              rows={getRowsForDate(tab.value)}
	              columns={getColumnsForDateWithTotal(tab.value, totalCost)}
	              pageSize={20}
	              rowsPerPageOptions={[10, 20, 50]}
	              disableSelectionOnClick
	              autoHeight
	              sx={dataGridHeaderSx}
	            />
	          </TabPanel>
	        );
	      } else {
	        if (!tab.interval) {
	          return null;
	        }
	        const intervalKey = tab.interval.label;
			const rows = getRowsByInterval(intervalKey);
			const totalSumForInterval = rows.reduce((acc, row) => acc + (row.totalCost ?? 0), 0);

			return (
			  <TabPanel key={`interval-panel-${intervalKey}`}>
			    <DataGrid
			      rows={rows}
			      columns={getColumnsForIntervalWithSummary(totalSumForInterval)}
			      pageSize={10}
			      rowsPerPageOptions={[10, 20, 50]}
			      disableSelectionOnClick
			      autoHeight
			      sx={dataGridHeaderSx}
			    />
			  </TabPanel>
	        );
	      }
	    })}
	  </Tabs>
	);

}
