import React, { useState, useEffect, useRef } from 'react';

interface EditProjectMenuProps {
  project: Project;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
}

interface FormState {
  domain: string;
  searchEngine: string;
  schedule: string;
}

export const EditProjectMenu: React.FC<EditProjectMenuProps> = ({ project, onClose, onSave }) => {
  const [formState, setFormState] = useState<FormState>({
    domain: project.domain,
    searchEngine: project.searchEngine,
    schedule: project.schedule,
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
    if (!formState.domain.trim()) {
      alert('Домен не может быть пустым');
      return;
    }
    onSave({ ...project, ...formState });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-project-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg p-6 w-96 shadow-lg"
      >
        <h2 id="edit-project-title" className="text-xl font-semibold mb-4">
          Редактировать проект
        </h2>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">Домен</span>
          <input
            type="text"
            value={formState.domain}
            onChange={(e) => handleChange('domain', e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">Поисковая система</span>
          <select
            value={formState.searchEngine}
            onChange={(e) => handleChange('searchEngine', e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Яндекс">Яндекс</option>
            <option value="Google">Google</option>
          </select>
        </label>

        <label className="block mb-4">
          <span className="text-sm font-medium text-gray-700">Расписание</span>
          <select
            value={formState.schedule}
            onChange={(e) => handleChange('schedule', e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="daily">Ежедневно</option>
            <option value="weekly">Еженедельно</option>
            <option value="manual">Вручную</option>
          </select>
        </label>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
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
