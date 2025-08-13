import React, { useState } from 'react';
import { registerManager } from '../utils/api';

interface RegisterManagerModalProps {
  onClose: () => void;
  onRegisterSuccess: (username: string, temporaryPassword: string) => void;
  token: string;
}

export const RegisterManagerModal: React.FC<RegisterManagerModalProps> = ({ onClose, onRegisterSuccess, token }) => {
  const [username, setUsername] = useState('');
  const [fullname, setFullname] = useState('');
  const [role, setRole] = useState<'admin' | 'manager'>('manager');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);


  const handleRegister = async () => {
    if (!username.trim()) {
      setError('Введите логин');
      return;
    }
    if (!fullname.trim()) {
      setError('Введите полное имя');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await registerManager(
        { username, temporary_password: username, fullname, role },
        token
      );
      onRegisterSuccess(username, result.temporary_password || username);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Ошибка регистрации');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center pt-24 z-60 overflow-auto">
      <div className="bg-white p-6 rounded shadow-md w-80">
        <h2 className="text-lg font-semibold mb-4">Регистрация менеджера</h2>

        {error && <div className="mb-2 text-red-600">{error}</div>}

        <input
          type="text"
          placeholder="Введите логин"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full mb-4 px-3 py-2 border rounded"
          autoFocus
        />
        <input
		  type="text"
		  placeholder="Введите имя"
		  value={fullname}
		  onChange={e => setFullname(e.target.value)}
		  className="w-full mb-4 px-3 py-2 border rounded"
		/>
		<select
		  value={role}
		  onChange={e => setRole(e.target.value as 'admin' | 'employee')}
		  className="w-full mb-4 px-3 py-2 border rounded"
		>
		  <option value="manager">Менеджер</option>
		  <option value="admin">Администратор</option>
		</select>
        <button
          onClick={handleRegister}
          disabled={isLoading}
          className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
        >
          {isLoading ? 'Регистрация...' : 'Зарегистрировать'}
        </button>

        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-gray-600 hover:underline"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};
