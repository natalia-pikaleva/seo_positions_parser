import React, { useState } from 'react';
import { changePassword } from '../utils/api';

interface ChangePasswordModalProps {
  token: string;
  onClose: () => void;
  onPasswordChanged: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ token, onClose, onPasswordChanged }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await changePassword(token, { old_password: oldPassword, new_password: newPassword });
      onPasswordChanged();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Ошибка при смене пароля');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-md w-80">
        <h2 className="text-lg font-semibold mb-4">Смена пароля</h2>

        {error && <div className="mb-2 text-red-600">{error}</div>}

        <input
          type="password"
          placeholder="Текущий пароль"
          value={oldPassword}
          onChange={e => setOldPassword(e.target.value)}
          className="w-full mb-3 px-3 py-2 border rounded"
          autoFocus
        />
        <input
          type="password"
          placeholder="Новый пароль"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="w-full mb-3 px-3 py-2 border rounded"
        />
        <input
          type="password"
          placeholder="Подтвердите новый пароль"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          className="w-full mb-4 px-3 py-2 border rounded"
        />

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Сохраняем...' : 'Сменить пароль'}
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
