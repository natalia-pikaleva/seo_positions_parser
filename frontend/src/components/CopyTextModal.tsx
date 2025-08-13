import React, { useState } from 'react';

interface CopyTextModalProps {
  visible: boolean;
  onClose: () => void;
  username: string;
  temporaryPassword: string;
}

export const CopyTextModal: React.FC<CopyTextModalProps> = ({ visible, onClose, username, temporaryPassword }) => {
  if (!visible) return null;

  const text = `Регистрация прошла успешно, для авторизации передайте сотруднику логин "${username}" и временный пароль "${temporaryPassword}"`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(text);
    alert('Текст скопирован в буфер обмена!');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded p-6 max-w-md w-full shadow-lg">
        <h2 className="text-xl font-bold mb-4">Регистрация успешна</h2>
        <textarea
          readOnly
          value={text}
          className="w-full p-2 border rounded mb-4 resize-none"
          rows={4}
          onFocus={e => e.target.select()}
        />
        <div className="flex justify-between">
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Копировать в буфер обмена
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-100"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
