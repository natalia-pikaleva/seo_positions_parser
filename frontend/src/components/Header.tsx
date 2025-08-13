import React from 'react';
import logo from '../assets/logo.png';

interface HeaderProps {
  userRole: string | null;
  authToken: string | null;
  isClientAccess: boolean;
  onLogout: () => void;
  onOpenRegisterModal: () => void;
  onOpenAuth: () => void;
  onOpenEmployeesModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  userRole,
  authToken,
  isClientAccess,
  onLogout,
  onOpenRegisterModal,
  onOpenAuth,
  onOpenEmployeesModal,
}) => {
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';

  return (
    <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 p-4 max-w-7xl mx-auto">
      <div className="flex items-center space-x-3 justify-center sm:justify-start w-full sm:w-auto">
        <img src={logo} alt="Логотип" className="h-12 w-auto" />
        <h1 className="text-xl font-bold">SEO Position Parser</h1>
      </div>

      {/* Контейнер с кнопками */}
      <div className="w-full sm:w-auto">
        {authToken || isClientAccess ? (
          <>
            {/* Для админа - в мобильной версии кнопки в одной строке и по правому краю */}
            {isAdmin && (
              <div className="flex justify-end w-full gap-2">
                <button
                  onClick={onOpenEmployeesModal}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Сотрудники
                </button>
                {authToken && (
                  <button
                    onClick={onLogout}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Выйти
                  </button>
                )}
              </div>
            )}

            {/* Для менеджера — кнопка Выйти справа */}
            {isManager && authToken && (
              <div className="flex justify-end w-full">
                <button
                  onClick={onLogout}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Выйти
                </button>
              </div>
            )}

            {/* Для остальных ролей (если нужны) - по умолчанию */}
            {!isAdmin && !isManager && authToken && (
              <div className="flex justify-center sm:justify-start w-full">
                <button
                  onClick={onLogout}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Выйти
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={onOpenAuth}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Войти
          </button>
        )}
      </div>
    </header>
  );
};
