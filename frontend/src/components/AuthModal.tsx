import React, { useState } from 'react';
import { loginUser } from '../utils/api';

interface AuthModalProps {
  onClose: () => void;
  onLoginSuccess: (token: string, isTemporaryPassword: boolean) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await loginUser(username, password);
      onLoginSuccess(data.access_token, data.is_temporary_password);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-md w-80">
        <h2 className="text-lg font-semibold mb-4">Авторизация</h2>

        {error && <div className="mb-2 text-red-600">{error}</div>}

        <input
          type="text"
          placeholder="Логин"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full mb-3 px-3 py-2 border rounded"
          autoFocus
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full mb-4 px-3 py-2 border rounded"
        />

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Вход...' : 'Войти'}
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