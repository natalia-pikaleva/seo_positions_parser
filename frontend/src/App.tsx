import React, { useState, useEffect, useCallback, useRef } from 'react';

import { Dashboard } from './components/Dashboard';
import { ProjectForm } from './components/ProjectForm';
import { PositionTable } from './components/PositionTable';
import { ClientView } from './components/ClientView';
import { AuthModal } from './components/AuthModal';
import { RegisterManagerModal } from './components/RegisterManagerModal';
import { Project } from './types';

import {
  fetchProjects,
  createProject,
  updateProject,
  fetchProject,
  fetchClientProjectByLink,
} from './utils/api';

interface JwtPayload {
  sub: string;
  role: string;
  exp: number;
  // другие поля, если есть
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentView, setCurrentView] = useState<'dashboard' | 'form' | 'project' | 'client'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isTemporaryPassword, setIsTemporaryPassword] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerSuccessUsername, setRegisterSuccessUsername] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const loadedRef = useRef(false);

  // Загрузка данных при монтировании
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    async function loadData() {
      setLoading(true);
      setError(null);

      const pathSegments = window.location.pathname.split('/');
      const clientIndex = pathSegments.indexOf('client');

      try {
        if (clientIndex !== -1 && pathSegments.length > clientIndex + 1) {
          const clientLink = pathSegments[clientIndex + 1];
          const project = await fetchClientProjectByLink(clientLink);
          setSelectedProject(project);
          setCurrentView('client');
        } else {
          const projects = await fetchProjects();
          setProjects(projects);
          setCurrentView('dashboard');
        }
      } catch (e) {
        console.error(e);
        setError('Ошибка загрузки данных');
        setCurrentView('dashboard');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Колбеки для управления состояниями и действиями

  const handleLoadDashboard = useCallback((projects: Project[]) => {
    setProjects(projects);
  }, []);

  const handleLoadClientProject = useCallback((project: Project) => {
    setSelectedProject(project);
  }, []);

  const handleError = useCallback((error: string) => {
    setError(error);
  }, []);

  const handleSetLoading = useCallback((loading: boolean) => {
    setLoading(loading);
  }, []);

  const handleSetView = useCallback((view: 'dashboard' | 'client') => {
    setCurrentView(view);
  }, []);

  const handleProjectLoaded = (project: Project) => {
    setSelectedProject(project);
    setProjects(prev => prev.map(p => (p.id === project.id ? project : p)));
  };

  const handleCreateProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'clientLink'>) => {
    try {
      const newProject = await createProject(projectData);
      setProjects(prev => [...prev, newProject]);
      setCurrentView('dashboard');
    } catch (error) {
      console.error('Ошибка создания проекта:', error);
      alert('Не удалось создать проект');
    }
  };

  const handleUpdateProject = async (updatedProject: Project) => {
    try {
      const project = await updateProject(updatedProject.id, updatedProject);
      setProjects(prev => prev.map(p => (p.id === project.id ? project : p)));
      setSelectedProject(project);
    } catch (error) {
      console.error('Ошибка обновления проекта:', error);
      alert('Не удалось обновить проект');
    }
  };

  const handleSelectProject = async (project: Project) => {
    try {
      const fullProject = await fetchProject(project.id);
      setSelectedProject(fullProject);
      setCurrentView('project');
    } catch (error) {
      console.error('Ошибка загрузки проекта:', error);
      alert('Не удалось загрузить проект');
    }
  };

  // Отображение состояний загрузки и ошибок

  if (loading) {
    return <div className="text-center py-8">Загрузка...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">{error}</div>;
  }

  // Отдельный рендер для клиентского вида

  if (currentView === 'client' && selectedProject) {
    console.log('Рендерим ClientView с проектом:', selectedProject);
    return <ClientView project={selectedProject} />;
  }

  // Открыть модалку авторизации
  const openAuth = () => setIsAuthOpen(true);
  const closeAuth = () => setIsAuthOpen(false);

  // Обработчик успешного логина
  const handleLoginSuccess = (token: string, isTemp: boolean) => {
    setAuthToken(token);
    setIsTemporaryPassword(isTemp);
    localStorage.setItem('token', token);

    try {
      const decoded = jwt_decode<JwtPayload>(token);
      setUserRole(decoded.role);
    } catch {
      setUserRole(null);
    }

    // Здесь можно загрузить проекты или другую логику
  };


  // Логика выхода
  const handleLogout = () => {
    setAuthToken(null);
    setUserRole(null);
    setIsTemporaryPassword(false);
    localStorage.removeItem('token');
    setCurrentView('dashboard');
  };

  // Функции открытия/закрытия модалки регистрации
  const openRegisterModal = () => {
    setRegisterSuccessUsername(null);
    setIsRegisterModalOpen(true);
  };
  const closeRegisterModal = () => setIsRegisterModalOpen(false);

  // Обработчик успешной регистрации
  const handleRegisterSuccess = (username: string) => {
    setRegisterSuccessUsername(username);
  };


  // Основной рендер

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center border-b border-gray-200">
		  <h1 className="text-xl font-bold">SEO Position Parser</h1>

		  <div className="flex items-center space-x-4">
		    {!authToken ? (
		      <button
		        onClick={openAuth}
		        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
		      >
		        Войти
		      </button>
		    ) : (
		      <>
		        {userRole === 'admin' && (
		          <button
		            onClick={openRegisterModal}
		            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
		          >
		            Регистрация менеджера
		          </button>
		        )}
		        <button
		          onClick={handleLogout}
		          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
		        >
		          Выйти
		        </button>
		      </>
		    )}
		  </div>
		</div>




      {/* Модалка регистрации менеджера */}
      {isRegisterModalOpen && (
        <RegisterManagerModal
		  onClose={closeRegisterModal}
		  onRegisterSuccess={handleRegisterSuccess}
		  token={authToken!}  // передаём токен из состояния authToken
		/>
      )}

      {/* Уведомление об успешной регистрации */}
      {registerSuccessUsername && (
        <div className="max-w-7xl mx-auto px-4 py-4 bg-green-100 text-green-800 rounded mt-4">
          Менеджер <strong>{registerSuccessUsername}</strong> успешно зарегистрирован.<br />
          Передайте ему логин и пароль (пароль равен логину) для авторизации.
        </div>
      )}

    {/* Модалка авторизации */}
    {isAuthOpen && (
      <AuthModal onClose={closeAuth} onLoginSuccess={handleLoginSuccess} />
    )}

    {/* Основной контент */}

    {/* Если клиентский просмотр — показываем ClientView без авторизации */}
    {currentView === 'client' && selectedProject ? (
      <ClientView project={selectedProject} />
    ) : (
      // Иначе показываем приложение только если авторизован
      authToken ? (
        <div className="max-w-7xl mx-auto px-4 py-8">
          {currentView === 'dashboard' && (
            <Dashboard
              projects={projects}
              onCreateProject={() => setCurrentView('form')}
              onSelectProject={handleSelectProject}
            />
          )}

          {currentView === 'form' && (
            <ProjectForm
              onSubmit={handleCreateProject}
              onCancel={() => setCurrentView('dashboard')}
            />
          )}

          {currentView === 'project' && selectedProject && (
            <div className="space-y-6">
              <button
                onClick={() => setCurrentView('dashboard')}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                ← Вернуться к проектам
              </button>
              <PositionTable
                project={selectedProject}
                onProjectLoaded={handleProjectLoaded}
                onUpdateProject={handleUpdateProject}
              />
            </div>
          )}
        </div>
      ) : (
        // Если не авторизован и не клиент — показываем кнопку Войти и/или сообщение
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-700">
          <p>Пожалуйста, войдите в систему для доступа к приложению.</p>
          <button
            onClick={openAuth}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Войти
          </button>
        </div>
      )
    )}
  </div>
);




}

export default App;
