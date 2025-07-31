import React from 'react';
import { FilterOptions } from '../types';

interface Props {
  filter: FilterOptions;
  setFilter: (filter: FilterOptions) => void;
  periodOffset: number;
  setPeriodOffset: (offset: number) => void;
  keywordFilter: string;
  setKeywordFilter: (value: string) => void;
}

export const PositionFilters: React.FC<Props> = ({
  filter,
  setFilter,
  periodOffset,
  setPeriodOffset,
  keywordFilter,
  setKeywordFilter,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-6">
    <select
      value={filter.period}
      onChange={(e) => setFilter({ ...filter, period: e.target.value as FilterOptions['period'] })}
      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="week">Неделя</option>
      <option value="month">Месяц</option>
      <option value="custom">Произвольный период</option>
    </select>
    <div className="flex justify-center sm:justify-start items-center gap-2 mb-4">
      <button
		  onClick={() => setPeriodOffset(periodOffset - 1)}
		  className="px-3 py-1 ..."
		>
		  <span className="sm:hidden">←</span>
		  <span className="hidden sm:inline">← Предыдущий</span>
	  </button>
	  <button
		  onClick={() => setPeriodOffset(0)}
		  className="px-3 py-1 ..."
		>
		  <span className="sm:hidden">Текущий</span>
		  <span className="hidden sm:inline">Текущий</span>
	  </button>
	  <button
		  onClick={() => setPeriodOffset(periodOffset + 1)}
		  className="px-3 py-1 ..."
		>
		  <span className="sm:hidden">→</span>
		  <span className="hidden sm:inline">Следующий →</span>
	  </button>

    </div>

    {/*<input
      type="text"
      placeholder="Фильтр по ключевому слову"
      value={keywordFilter}
      onChange={(e) => setKeywordFilter(e.target.value)}
      className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />*/}
  </div>
);
