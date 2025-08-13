import React, { useEffect, useState } from 'react';

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

interface EmployeesModalProps {
  token: string;
  onClose: () => void;
  onOpenRegisterModal: () => void;
  fetchUsers: (token: string) => Promise<User[]>;
  deleteUser: (userId: number, token: string) => Promise<void>;
  onEditUser: (user: User) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

export const EmployeesModal: React.FC<EmployeesModalProps> = ({
  token,
  onClose,
  onOpenRegisterModal,
  fetchUsers,
  deleteUser,
  onEditUser,
  users,
  setUsers,
}) => {
  const [loading, setLoading] = useState(false);
  const [expandedUserIds, setExpandedUserIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const list = await fetchUsers(token);
      setUsers(list);
      setError(null);
    } catch {
      setError('Ошибка загрузки пользователей');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [token]);

  const toggleExpand = (userId: number) => {
    setExpandedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const handleDelete = async (userId: number) => {
    if (!window.confirm('Вы действительно хотите удалить пользователя?')) return;
    try {
      await deleteUser(userId, token);
      await loadUsers(); // обновляем список после удаления
    } catch {
      alert('Ошибка при удалении пользователя');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start pt-24 z-40 overflow-auto">
	  <div className="bg-white rounded shadow-lg w-full max-w-5xl max-h-[90vh] overflow-auto p-6">
	    <div className="flex justify-between items-center mb-4">
	      <h2 className="text-xl font-semibold">Список сотрудников</h2>
	      <div className="flex items-start space-x-2">
			  <button
			    onClick={onOpenRegisterModal}
			    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
			  >
			    + Создать
			  </button>
			  <button
			    onClick={onClose}
			    className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
			    title="Закрыть"
			  >
			    ✕
			  </button>
			</div>

	    </div>

	    {loading && <p>Загрузка...</p>}
	    {error && <p className="text-red-600">{error}</p>}
	    {!loading && !error && users.length === 0 && <p>Нет сотрудников</p>}

	    {/* Таблица для ПК */}
	    <div className="hidden sm:block">
	      <table className="w-full border border-gray-300 text-left text-sm">
	        <thead className="bg-gray-100">
	          <tr>
	            <th className="p-2 border-b border-gray-300">Логин</th>
	            <th className="p-2 border-b border-gray-300">Имя</th>
	            <th className="p-2 border-b border-gray-300">Роль</th>
	            <th className="p-2 border-b border-gray-300">Проекты</th>
	            <th className="p-2 border-b border-gray-300">Действия</th>
	          </tr>
	        </thead>
	        <tbody>
	          {users.map((user) => (
	            <React.Fragment key={user.id}>
	              <tr>
	                <td className="p-2 border-b border-gray-300 align-top">{user.username}</td>
	                <td className="p-2 border-b border-gray-300 align-top">{user.fullname || '-'}</td>
	                <td className="p-2 border-b border-gray-300 align-top">{user.role}</td>
	                <td className="p-2 border-b border-gray-300 align-top">
	                  {user.role.toLowerCase() === 'admin' ? (
	                    <span />
	                  ) : user.projects && user.projects.length > 0 ? (
	                    <button
	                      type="button"
	                      className="text-blue-600 underline hover:text-blue-800"
	                      onClick={() => toggleExpand(user.id)}
	                      aria-expanded={expandedUserIds.has(user.id)}
	                      aria-controls={`projects-list-${user.id}`}
	                    >
	                      {expandedUserIds.has(user.id)
	                        ? 'Скрыть проекты'
	                        : `Показать проекты (${user.projects.length})`}
	                    </button>
	                  ) : (
	                    <span className="text-gray-500 italic">Проекты не назначены</span>
	                  )}
	                </td>

	                <td className="p-2 border-b border-gray-300 align-top space-x-2">
	                  <button
	                    onClick={() => onEditUser(user)}
	                    className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
	                  >
	                    Изменить
	                  </button>
	                  <button
	                    onClick={() => handleDelete(user.id)}
	                    className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
	                  >
	                    Удалить
	                  </button>
	                </td>
	              </tr>

	              {expandedUserIds.has(user.id) && (
	                <tr>
	                  <td colSpan={5} className="bg-gray-50 p-2 border-b border-gray-300" id={`projects-list-${user.id}`}>
	                    {user.projects && user.projects.length > 0 ? (
	                      <ul className="list-disc pl-6">
	                        {user.projects.map((proj) => (
	                          <li key={proj.id}>{proj.domain}</li>
	                        ))}
	                      </ul>
	                    ) : (
	                      <p className="italic text-gray-600">Проекты не назначены</p>
	                    )}
	                  </td>
	                </tr>
	              )}
	            </React.Fragment>
	          ))}
	        </tbody>
	      </table>
	    </div>

	    {/* Карточки для мобильных */}
	    <div className="block sm:hidden space-y-4">
	      {users.map((user) => (
	        <div key={user.id} className="border border-gray-300 rounded p-4 shadow-sm relative bg-white">
	          {/* Имя сверху */}
	          <p className="font-semibold text-lg mb-2">{user.fullname || user.username}</p>

	          <div className="flex justify-between">
	            {/* Левая колонка: логин и роль */}
	            <div>
	              <p className="text-sm text-gray-600">Логин: <span className="font-medium">{user.username}</span></p>
	              <p className="text-sm capitalize mt-1">Роль: <span className="font-medium">{user.role}</span></p>
	            </div>

	            {/* Правая колонка: кнопки */}
	            <div className="flex flex-col space-y-2">
	              <button
	                onClick={() => onEditUser(user)}
	                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
	              >
	                Изменить
	              </button>
	              <button
	                onClick={() => handleDelete(user.id)}
	                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
	              >
	                Удалить
	              </button>
	            </div>
	          </div>

	          {/* Кнопка Показать проекты */}
	          {user.role.toLowerCase() !== 'admin' && (
	            <button
	              type="button"
	              className="mt-3 text-blue-600 underline hover:text-blue-800 text-sm"
	              onClick={() => toggleExpand(user.id)}
	              aria-expanded={expandedUserIds.has(user.id)}
	              aria-controls={`projects-list-mobile-${user.id}`}
	            >
	              {expandedUserIds.has(user.id)
	                ? 'Скрыть проекты ▼'
	                : `Показать проекты (${user.projects?.length || 0}) ▶`}
	            </button>
	          )}

	          {/* Список проектов */}
	          {expandedUserIds.has(user.id) && (
	            <div
	              id={`projects-list-mobile-${user.id}`}
	              className="mt-2 bg-gray-50 p-3 rounded text-sm"
	            >
	              {user.projects && user.projects.length > 0 ? (
	                <ul className="list-disc list-inside max-h-40 overflow-auto">
	                  {user.projects.map((proj) => (
	                    <li key={proj.id}>{proj.domain}</li>
	                  ))}
	                </ul>
	              ) : (
	                <p className="italic text-gray-600">Проекты не назначены</p>
	              )}
	            </div>
	          )}
	        </div>
	      ))}
	    </div>
	  </div>
	</div>
  );
};
