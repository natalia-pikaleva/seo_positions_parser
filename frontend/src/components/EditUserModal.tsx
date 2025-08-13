import React, { useEffect, useState } from 'react';
import { resetTemporaryPassword } from '../utils/api';

interface Project {
  id: string;
  domain: string;
}

interface User {
  id: number;
  username: string;
  fullname?: string;
  role: string;
  projects?: Project[];
}

interface EditUserModalProps {
  token: string;
  user: User;
  onClose: () => void;
  onSave: (updatedUser: User) => void;
  updateUser: (
    userId: number,
    data: { fullname?: string | null; role?: string; project_ids?: string[] },
    token: string,
  ) => Promise<User>;
  fetchProjects: (token: string) => Promise<Project[]>;
}


interface ProjectOption extends Project {
  selected: boolean;
}


export const EditUserModal: React.FC<EditUserModalProps> = ({
  token,
  user,
  onClose,
  onSave,
  updateUser,
  fetchProjects
}) => {
  const [fullname, setFullname] = useState(user.fullname || '');
  const [role, setRole] = useState(user.role);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);


  useEffect(() => {
    const loadProjects = async () => {
      try {
        const allProjects = await fetchProjects(token);
        const userProjectIds = new Set((user.projects || []).map((p) => p.id));
        const opts = allProjects.map((p) => ({
          ...p,
          selected: userProjectIds.has(p.id),
        }));
        setProjects(opts);
      } catch {
        setError('Ошибка загрузки проектов');
      }
    };
    loadProjects();
  }, [token, user.projects]);

  const handleResetPassword = async () => {
	  setResetPasswordLoading(true);
	  setResetPasswordError(null);
	  setTempPassword(null);

	  try {
	    const data = await resetTemporaryPassword(user.id, token);
	    setTempPassword(data.temp_password);
	    alert(`Пароль успешно сброшен. Новый временный пароль: ${data.temp_password}`);
	  } catch (error: any) {
	    setResetPasswordError(error.message || 'Ошибка сброса пароля');
	  } finally {
	    setResetPasswordLoading(false);
	  }
	};


  const toggleProjectSelected = (id: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)),
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const selectedProjectIds = projects.filter((p) => p.selected).map((p) => p.id);
      const updatedUser = await updateUser(
        user.id,
        {
          fullname: fullname.trim() || null,
          role,
          project_ids: selectedProjectIds,
        },
        token,
      );
      onSave(updatedUser);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4 overflow-auto">
	  <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
	    <h2 className="text-xl font-bold mb-6 text-center sm:text-left">
	      Редактировать пользователя
	    </h2>

	    <button
	      onClick={onClose}
	      className="absolute top-2 right-4 text-gray-600 hover:text-gray-900 text-2xl font-bold"
	      aria-label="Закрыть"
	      type="button"
	    >
	      ×
	    </button>

	    <form
	      onSubmit={e => {
	        e.preventDefault();
	        handleSubmit();
	      }}
	      className="space-y-6"
	      noValidate
	    >
	      <div>
	        <label className="block font-medium mb-1">Логин (username)</label>
	        <input
	          type="text"
	          value={user.username}
	          disabled
	          className="w-full border border-gray-300 px-3 py-2 rounded bg-gray-100 cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
	        />
	      </div>

	      <div>
	        <label htmlFor="fullname" className="block font-medium mb-1">
	          ФИО
	        </label>
	        <input
	          id="fullname"
	          type="text"
	          value={fullname}
	          onChange={(e) => setFullname(e.target.value)}
	          className="w-full border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
	          placeholder="Введите полное имя"
	        />
	      </div>

	      <div>
	        <label htmlFor="role" className="block font-medium mb-1">
	          Роль
	        </label>
	        <select
	          id="role"
	          value={role}
	          onChange={(e) => setRole(e.target.value)}
	          className="w-full border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
	        >
	          <option value="admin">Админ</option>
	          <option value="manager">Менеджер</option>
	        </select>
	      </div>

	      <div>
	        <label className="block font-medium mb-2">Проекты:</label>
	        <div className="max-h-40 overflow-auto border border-gray-300 rounded p-2">
	          {projects.length === 0 && (
	            <p className="text-gray-500 text-sm">Нет доступных проектов</p>
	          )}
	          {projects.map((p) => (
	            <label key={p.id} className="flex items-center space-x-2 mb-1 cursor-pointer">
	              <input
	                type="checkbox"
	                checked={p.selected}
	                onChange={() => toggleProjectSelected(p.id)}
	                className="cursor-pointer"
	              />
	              <span>{p.domain}</span>
	            </label>
	          ))}
	        </div>
	      </div>

	      {error && <p className="text-red-600">{error}</p>}

	      {tempPassword && (
	        <p className="text-green-700 mt-2 break-words">
	          Новый временный пароль для пользователя: <b>{tempPassword}</b>
	        </p>
	      )}
		  {resetPasswordError && (
					    <p className="text-red-600 ml-2 whitespace-nowrap">{resetPasswordError}</p>
					  )}

	      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
			  {/* Левая часть — сброс пароля */}
			  <div className="sm:flex-1">
			    <button
			      type="button"
			      onClick={handleResetPassword}
			      disabled={resetPasswordLoading}
			      className="w-full sm:w-auto px-2 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition text-sm text-center"
			    >
			      {resetPasswordLoading ? 'Сброс...' : 'Сбросить пароль'}
			    </button>
			  </div>

			  {/* Правая часть — Отмена и Сохранить */}
			  <div className="flex flex-row space-x-2 justify-end sm:flex-none w-full sm:w-auto">
			    <button
			      type="button"
			      onClick={onClose}
			      disabled={loading}
			      className="flex-1 sm:flex-none px-2 py-2 border border-gray-300 rounded hover:bg-gray-100 text-sm"
			    >
			      Отмена
			    </button>
			    <button
			      type="submit"
			      disabled={loading}
			      className="flex-1 sm:flex-none px-2 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
			    >
			      {loading ? 'Сохраняем...' : 'Сохранить'}
			    </button>
			  </div>
			</div>

	    </form>
	  </div>
	</div>

  );
};
