import React, { useState, useEffect, useRef } from 'react';
import { Group } from '../types';

interface EditGroupMenuProps {
  group: Group;
  onClose: () => void;
  onSave: (updatedGroup: Group) => void;
}

interface FormState {
  title: string;
  region: string;
  searchEngine: string;
}

export const EditGroupMenu: React.FC<EditGroupMenuProps> = ({ group, onClose, onSave }) => {
  const [formState, setFormState] = useState<FormState>({
    title: group.title,
    region: group.region,
    searchEngine: group.searchEngine,
  });

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleChange = (field: keyof FormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!formState.title.trim()) {
      alert('Название группы не может быть пустым');
      return;
    }
    if (!formState.region.trim()) {
      alert('Регион не может быть пустым');
      return;
    }
    onSave({ ...group, ...formState });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-group-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg p-4 sm:p-6 w-[94vw] max-w-sm sm:max-w-md shadow-lg overflow-y-auto max-h-[95vh]"
      >
        <h2 id="edit-group-title" className="text-xl font-semibold mb-4">
          Редактировать группу
        </h2>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">Название</span>
          <input
            type="text"
            value={formState.title}
            onChange={(e) => handleChange('title', e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block mb-3">
		  <span className="text-sm font-medium text-gray-700">Регион</span>
		  <select
		    value={formState.region}
		    onChange={(e) => handleChange('region', e.target.value)}
		    className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
		  >
		    <option value="">Выберите регион</option>
		    <option value="Москва">Москва</option>
		    <option value="Санкт-Петербург">Санкт-Петербург</option>
		  </select>
		</label>


        <label className="block mb-4">
          <span className="text-sm font-medium text-gray-700">Поисковая система</span>
          <select
            value={formState.searchEngine}
            onChange={(e) => handleChange('searchEngine', e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="yandex">Яндекс</option>
            <option value="google">Google</option>
          </select>
        </label>

        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-4">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
