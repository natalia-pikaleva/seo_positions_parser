import React, { useState } from 'react';

interface ExportModalProps {
  onClose: () => void;
  onExport: (startDate: string, endDate: string) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose, onExport }) => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const handleExport = () => {
    if (!startDate || !endDate) {
      alert('Пожалуйста, выберите обе даты');
      return;
    }
    if (startDate > endDate) {
      alert('Дата начала не может быть позже даты окончания');
      return;
    }
    onExport(startDate, endDate);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 sm:p-6 rounded shadow-lg w-full max-w-xs sm:max-w-sm md:max-w-md">
        <h3 className="text-lg font-semibold mb-4">Выберите период для экспорта</h3>
        <div className="flex flex-col gap-4">
          <label>
            Начальная дата:
            <input
              type="date"
              className="mt-1 block w-full border border-gray-300 rounded px-2 py-1"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label>
            Конечная дата:
            <input
              type="date"
              className="mt-1 block w-full border border-gray-300 rounded px-2 py-1"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => {
			  if (!startDate || !endDate) {
			    alert('Пожалуйста, выберите обе даты');
			    return;
			  }
			  if (startDate > endDate) {
			    alert('Дата начала не может быть позже даты окончания');
			    return;
			  }
			  onExport(startDate, endDate);
			}}>
			  Экспортировать
			</button>
          </div>
        </div>
      </div>
    </div>
  );
};
