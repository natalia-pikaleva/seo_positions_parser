import React from 'react';
import { Project, Position } from '../types';
import {
  getPositionColor,
  getTrendIcon,
  getTrendColor,
} from '../utils/positionUtils';

interface Props {
  editableProject: Project;
  filteredKeywords: Project['keywords'];
  positionsMap: Record<string, Record<string, Position>>;
  dates: Date[];
  headerDates: Date[];
  dateGroups: {
		  dates: Date[];
		  startDate: string;
		  endDate: string;
		  display_start_date?: string;
		  display_end_date?: string;
		  isLastPartial?: boolean;
		}[];
  filterPeriod: FilterOptions['period'];
  intervalSums: Record<string, Record<string, number>>;
  formatDateKey: (date: Date) => string;
}

const daysOfWeek = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getMonthMatrix(dates) {
  // dates отсортированы, берем первый
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const firstDay = firstDate.getDay() || 7; // JS: 0=Вс, но у нас 1=Пн
  // Начинаем с понедельника
  const calendar = [];
  let week = [];
  // Заполняем пустыми ячейками до первого дня месяца
  for (let i = 1; i < firstDay; i++) week.push(null);

  dates.forEach(date => {
    week.push(date);
    if (week.length === 7) {
      calendar.push(week);
      week = [];
    }
  });
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    calendar.push(week);
  }
  return calendar;
}

const MonthCalendarCard = ({
  dates, keyword, positionsMap, formatDateKey, getPositionColor
}) => {
  const matrix = getMonthMatrix(dates);
  return (
    <div>
      <div className="flex mb-2">
        {daysOfWeek.map(d => (
          <div key={d} className="flex-1 text-center text-xs font-semibold text-blue-700">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {matrix.flat().map((date, i) => {
          if (!date) {
            return <div key={i} className="h-8"></div>;
          }
          const pos = positionsMap[keyword.id]?.[formatDateKey(date)];
          return (
            <div key={date.toISOString()} className="h-10 flex flex-col items-center justify-center">
			  <span className="text-xs text-gray-500">{date.getDate()}</span>
			  {pos && pos.position !== undefined ? (
			    <div className="flex flex-col items-center">
			      <span className={`inline-flex px-1 py-0.5 text-[10px] font-semibold rounded-full ${getPositionColor(pos.position)}`}>
			        #{pos.position}
			      </span>
			      {pos.cost !== undefined && (
			        <span className="text-[9px] leading-none text-gray-600 mt-0.5">{pos.cost}₽</span>
			      )}
			    </div>
			  ) : (
			    <span className="text-gray-300 text-xs">—</span>
			  )}
			</div>

          );
        })}
      </div>
    </div>
  );
};

export const PositionTableView: React.FC<Props> = ({
  editableProject,
  filteredKeywords,
  positionsMap,
  dates,
  headerDates,
  dateGroups,
  filterPeriod,
  intervalSums,
  formatDateKey,
}) => {
  // Логируем данные для отладки
	console.log('dateGroups:', dateGroups);

  return (
	<>
    {/* ПК-таблица */}
	<div className="hidden sm:block">
	  <div className="overflow-x-auto" style={{ maxWidth: 'calc(100vw - 40px)', maxHeight: '500px', overflowY: 'auto' }}>
	    <table className="min-w-max w-full table-auto border-collapse border border-gray-200">
		  <thead>
		    <tr className="bg-gray-50">
		      <th
			  className="sticky top-0 left-0 bg-white z-40 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[150px] max-w-[400px] border-r border-gray-300"
			  style={{ boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}
			>
			  Ключевой запрос
			</th>
		      <th
			  className="sticky top-0 left-150 bg-white z-35 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[150px] max-w-[400px] border-r border-gray-300"
			  style={{ boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}
			>
			Регион
		      </th>

		      {filterPeriod === 'week' && headerDates.map(date => (
		        <th
		          key={date.toISOString()}
		          className="sticky top-0 bg-gray-50 z-20 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[70px]"
		        >
		          {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
		        </th>
		      ))}

		      {filterPeriod === 'month' && dateGroups.map((group, idx) => (
				  <React.Fragment key={idx}>
				    {group.dates.map(date => (
				      <th
				        key={date.toISOString()}
				        className="sticky top-0 bg-gray-50 z-20 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[70px]"
				      >
				        {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
				      </th>
				    ))}
				    {!group.isLastPartial && (
				      <th
				        key={`sum-${idx}`}
				        className="sticky top-0 bg-gray-50 z-20 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]"
				      >
				        Сумма за 14 дней
				      </th>
				    )}
				  </React.Fragment>
				))}

		    </tr>
		  </thead>

		  <tbody>
			  {filteredKeywords.map(keyword => {
			    const posByDate = positionsMap[keyword.id] || {};
			    return (
			      <tr
			        key={keyword.id}
			        className="hover:bg-gray-50 even:bg-blue-50"
			        style={{ height: 20 }}
			      >
			        <td
					  className="sticky left-0 bg-white z-40 px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[150px] max-w-[400px] border-r border-gray-300"
					  style={{ boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}
					>
					  {keyword.keyword}
					</td>
			        <td
					  className="sticky left-150 bg-white z-35 px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[150px] max-w-[400px] border-r border-gray-300"
					  style={{ boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }}
					>
			          {keyword.region}
			        </td>

			        {filterPeriod === 'month' ? (
					  dateGroups.map((group, idx) => {
					    let groupSum = 0;
					    const intervalLabel = `${group.startDate} - ${group.endDate}`;

					    return (
					      <React.Fragment key={idx}>
					        {group.dates.map(date => {
					          const dateKey = formatDateKey(date);
					          const pos = posByDate[dateKey];
					          if (pos && pos.position !== undefined && pos.position !== null) {
					            if (pos.cost) groupSum += pos.cost;
					            return (
					              <td key={dateKey} className="px-3 py-2 text-center text-sm">
					                <div className="flex flex-col items-center gap-1">
					                  <div className="flex items-center gap-1">
					                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPositionColor(pos.position)}`}>
					                      #{pos.position}
					                    </span>
					                    {/* Тренд можно раскомментировать при необходимости */}
					                    {/* <span className={`text-xs ${getTrendColor(pos.trend)}`} title="Динамика позиции">
					                      {getTrendIcon(pos.trend)}
					                    </span> */}
					                    <span className="text-xs text-gray-700">
					                      {pos.cost ? `${pos.cost} ₽` : '—'}
					                    </span>
					                  </div>
					                </div>
					              </td>
					            );
					          }
					          return (
					            <td key={dateKey} className="px-3 py-2 text-center text-sm text-gray-400">—</td>
					          );
					        })}
					        {!group.isLastPartial && (
					          <td key={`sum-${idx}`} className="px-3 py-2 text-center text-sm font-semibold text-gray-900">
					            {intervalSums[keyword.id]?.[intervalLabel] !== undefined
					              ? `${intervalSums[keyword.id][intervalLabel]} ₽`
					              : (groupSum > 0 ? `${groupSum} ₽` : '—')}
					          </td>
					        )}
					      </React.Fragment>
					    );
					  })
					) : (
					  // Рендер для недели (оставляем без изменений)
					  dates.map(date => {
					    const dateKey = formatDateKey(date);
					    const pos = posByDate[dateKey];
					    if (pos && pos.position !== undefined && pos.position !== null) {
					      return (
					        <td key={dateKey} className="px-3 py-2 text-center text-sm">
					          <div className="flex flex-col items-center gap-1">
					            <div className="flex items-center gap-1">
					              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPositionColor(pos.position)}`}>
					                #{pos.position}
					              </span>
					              <span className={`text-xs ${getTrendColor(pos.trend)}`} title="Динамика позиции">
					                {getTrendIcon(pos.trend)}
					              </span>
					            </div>
					            <span className="text-xs text-gray-700">
					              {pos.cost ? `${pos.cost} ₽` : '—'}
					            </span>
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

					  {(filterPeriod === 'month' ? dateGroups : [dates]).map((group, idx) => {
					    let groupTotal = 0;

					    // Для month — group это объект с dates, для week — просто массив дат
					    const datesArray = (filterPeriod === 'month' && group && 'dates' in group)
					      ? group.dates
					      : (group as Date[]);

					    if (!datesArray) return null;

					    const dayCells = datesArray.map(date => {
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
					        {!group.isLastPartial && filterPeriod === 'month' && (
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

	{/* Мобильные карточки */}
	<div className="block sm:hidden">
	  {filteredKeywords.map(keyword => (
	    <div key={keyword.id} className="mb-4 p-3 bg-white shadow rounded border">
	      <div className="font-semibold text-gray-900">{keyword.keyword}</div>
	      <div className="text-sm text-gray-600 mb-2">{keyword.region}</div>
	      {filterPeriod === 'month'
	        ? (
	            <>
	              {/* Получаем название месяца и года из первой даты массива dates */}
	              <div className="text-center text-sm font-semibold text-blue-700 mb-2">
	                {dates.length > 0 && dates[0].toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
	              </div>
	              <MonthCalendarCard
	                dates={dates}
	                keyword={keyword}
	                positionsMap={positionsMap}
	                formatDateKey={formatDateKey}
	                getPositionColor={getPositionColor}
	              />
	            </>
	          )
	        : (
	          <div className="divide-y">
	            {dates.map(date => {
	              const pos = positionsMap[keyword.id]?.[formatDateKey(date)];
	              return (
	                <div className="flex justify-between py-1 text-xs" key={date.toISOString()}>
	                  <span className="text-gray-500">
	                    {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
	                  </span>
	                  <span>
	                    {pos && pos.position !== undefined
	                      ? <>
	                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPositionColor(pos.position)}`}>
	                            #{pos.position}
	                          </span>
	                          {pos.cost && <span className="ml-2">{pos.cost}₽</span>}
	                        </>
	                      : '—'}
	                  </span>
	                </div>
	              );
	            })}
	          </div>
	        )
	      }
	    </div>
	  ))}
	</div>

	</>
);
};