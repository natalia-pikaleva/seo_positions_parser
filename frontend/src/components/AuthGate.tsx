import React from 'react';
import logo from '../assets/logo.png';
import { AuthModal } from './AuthModal';

interface AuthGateProps {
  loading: boolean;
  error: string | null;
  authToken: string | null;
  isClientAccess: boolean;
  isAuthOpen: boolean;
  onOpenAuth: () => void;
  onCloseAuth: () => void;
  onLoginSuccess: (token: string, isTemp: boolean) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  loading,
  error,
  authToken,
  isClientAccess,
  isAuthOpen,
  onOpenAuth,
  onCloseAuth,
  onLoginSuccess,
}) => {
  if (loading) {
    return <div className="text-center py-8">Загрузка...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">{error}</div>;
  }

  if (!authToken && !isClientAccess) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-700">
        <div className="flex items-center space-x-3 justify-center sm:justify-start w-full sm:w-auto">
          <img src={logo} alt="Логотип" className="h-12 w-auto" />
          <h1 className="text-xl font-bold">SEO Position Parser</h1>
        </div>
        <p>Пожалуйста, войдите в систему для доступа к приложению.</p>
        <button
          onClick={onOpenAuth}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Войти
        </button>
        {isAuthOpen && <AuthModal onClose={onCloseAuth} onLoginSuccess={onLoginSuccess} />}
      </div>
    );
  }

  return null;
};
