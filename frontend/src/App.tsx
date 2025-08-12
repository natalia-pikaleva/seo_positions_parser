import React, { useState, useEffect, useCallback, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';

import { Dashboard } from './components/Dashboard';
import { ProjectForm } from './components/ProjectForm';
import { PositionTable } from './components/PositionTable';
import { ProjectGroups } from './components/ProjectGroups';
import { AuthModal } from './components/AuthModal';
import { RegisterManagerModal } from './components/RegisterManagerModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';

import { Project, Group } from './types';

import {
  fetchProjects,
  createProject,
  updateProject,
  fetchProject,
  fetchClientProjectByLink,
} from './utils/api';

import logo from './assets/logo.png';

interface JwtPayload {
  sub: string;
  role: string;
  exp: number;
  // другие поля, если есть
}

type View = 'dashboard' | 'form' | 'projectGroups' | 'positionTable' | 'client';

function App() {
  // Основные состояния
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Авторизация
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isTemporaryPassword, setIsTemporaryPassword] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => { //
	  const init = async () => {
	    setLoading(true);
	    setError(null);
	    try {
	      const savedToken = localStorage.getItem('token');
	      if (savedToken) {
	        const decoded = jwtDecode<JwtPayload>(savedToken);
	        const now = Date.now() / 1000;
	        if (decoded.exp && decoded.exp > now) {
	          setAuthToken(savedToken);
	          setUserRole(decoded.role);
	        } else {
	          localStorage.removeItem('token');
	          setAuthToken(null);
	          setUserRole(null);
	        }
	      }

	      const pathSegments = window.location.pathname.split('/');
	      const clientIndex = pathSegments.indexOf('client');

	      if (clientIndex !== -1 && pathSegments.length > clientIndex + 1) {
	        const clientLink = pathSegments[clientIndex + 1];
	        const project = await fetchClientProjectByLink(clientLink);
	        setSelectedProject(project);
	        setIsClientAccess(true);
	        setCurrentView('positionTable'); // <== здесь важное изменение
	      } else {
	        setIsClientAccess(false);
	        const list = await fetchProjects();
	        setProjects(list);
	        setCurrentView('dashboard');
	      }
	    } catch (e) {
	      console.error(e);
	      setError('Ошибка загрузки данных');
	      setCurrentView('dashboard');
	    } finally {
	      setLoading(false);
	      setAuthLoading(false);
	    }
	  };

	  init();
	}, []);



  // Модалки регистрации и смены пароля
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerSuccessUsername, setRegisterSuccessUsername] = useState<string | null>(null);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const [isClientAccess, setIsClientAccess] = useState(false);

  // Обработчик выбора проекта
  const handleSelectProject = useCallback(async (project: Project) => {
    setLoading(true);
    try {
      const fullProject = await fetchProject(project.id);
      setSelectedProject(fullProject);
      setSelectedGroup(null);
      setCurrentView('projectGroups');
    } catch (e) {
      console.error(e);
      alert('Не удалось загрузить проект');
    } finally {
      setLoading(false);
    }
  }, []);

  // Обработчик выбора группы
  const handleSelectGroup = useCallback(async (group: Group) => {
	  if (!selectedProject) return;
	  setLoading(true);
	  try {
	    const updatedProject = await fetchProject(selectedProject.id);
	    setSelectedProject(updatedProject);
	    const foundGroup = updatedProject.groups.find(g => g.id === group.id) || null;
	    setSelectedGroup(foundGroup);
	    setCurrentView('positionTable');
	  } catch (e) {
	    alert('Не удалось загрузить проект');
	  } finally {
	    setLoading(false);
	  }
	}, [selectedProject]);


  // Возврат из ProjectGroups к Dashboard
  const handleBackToDashboard = useCallback(() => {
    setSelectedProject(null);
    setSelectedGroup(null);
    setCurrentView('dashboard');
  }, []);

  // Возврат из PositionTable к проекту (список групп)
  const handleBackToProjectGroups = useCallback(() => {
    setSelectedGroup(null);
    setCurrentView('projectGroups');
  }, []);

  // Обновление проектов
  const refreshProjects = useCallback(async () => {
    try {
      const list = await fetchProjects();
      setProjects(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  // Обновление выбранного проекта
  const refreshProject = useCallback(async () => {
    if (!selectedProject) return null;
    try {
      const project = await fetchProject(selectedProject.id);
      setSelectedProject(project);
      return project;
    } catch {
      return null;
    }
  }, [selectedProject]);

  // Обработки создания и обновления проектов
  const handleCreateProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'clientLink'>) => {
    try {
      const newProject = await createProject(projectData);
      setProjects(prev => [...prev, newProject]);
      setCurrentView('dashboard');
    } catch (e) {
      console.error(e);
      alert('Не удалось создать проект');
    }
  };

  const handleUpdateProject = async (updatedProject: Project) => {
    try {
      const project = await updateProject(updatedProject.id, updatedProject);
      setProjects(prev => prev.map(p => (p.id === project.id ? project : p)));
      setSelectedProject(project);
    } catch (e) {
      console.error(e);
      alert('Не удалось обновить проект');
    }
  };

  const handleProjectGroupLoaded = (updatedProject: Project) => {
    setSelectedProject(updatedProject);
    setProjects(prev => prev.map(p => (p.id === updatedProject.id ? updatedProject : p)));
  };

  // Обработка логина
  const handleLoginSuccess = (token: string, isTemp: boolean) => {
    setAuthToken(token);
    setIsTemporaryPassword(isTemp);
    localStorage.setItem('token', token);

    try {
      const decoded = jwtDecode<JwtPayload>(token);
      setUserRole(decoded.role);
    } catch {
      setUserRole(null);
    }

    if (isTemp) {
      setShowChangePasswordModal(true);
    }
  };

//   useEffect(() => {
// 	  async function init() {
// 	    setLoading(true);
// 	    setError(null);
//
// 	    try {
// 	      const savedToken = localStorage.getItem('token');
// 	      if (savedToken) {
// 	        const decoded = jwtDecode<JwtPayload>(savedToken);
// 	        const now = Date.now() / 1000;
// 	        if (decoded.exp && decoded.exp > now) {
// 	          setAuthToken(savedToken);
// 	          setUserRole(decoded.role);
// 	        } else {
// 	          localStorage.removeItem('token');
// 	          setAuthToken(null);
// 	          setUserRole(null);
// 	        }
// 	      }
//
// 	      const pathSegments = window.location.pathname.split('/');
// 	      const clientIndex = pathSegments.indexOf('client');
//
// 	      if (clientIndex !== -1 && pathSegments.length > clientIndex + 1) {
// 	        const clientLink = pathSegments[clientIndex + 1];
// 	        const project = await fetchClientProjectByLink(clientLink);
// 	        setSelectedProject(project);
// 	        setIsClientAccess(true);
// 	        setCurrentView('projectGroups');
// 	      } else {
// 	        setIsClientAccess(false);
// 	        const list = await fetchProjects();
// 	        setProjects(list);
// 	        setCurrentView('dashboard');
// 	      }
// 	    } catch (e) {
// 	      console.error(e);
// 	      setError('Ошибка загрузки данных');
// 	      setCurrentView('dashboard');
// 	    } finally {
// 	      setLoading(false);
// 	    }
// 	  }
//
// 	  init();
// 	}, []);

  // Выход из системы
  const handleLogout = () => {
    setAuthToken(null);
    setUserRole(null);
    setIsTemporaryPassword(false);
    localStorage.removeItem('token');
    setCurrentView('dashboard');
    setSelectedProject(null);
    setSelectedGroup(null);
  };

  // Модалки управления
  const openAuth = () => setIsAuthOpen(true);
  const closeAuth = () => setIsAuthOpen(false);

  const openRegisterModal = () => {
    setRegisterSuccessUsername(null);
    setIsRegisterModalOpen(true);
  };
  const closeRegisterModal = () => setIsRegisterModalOpen(false);

  const handleRegisterSuccess = (username: string) => {
    setRegisterSuccessUsername(username);
  };

  if (loading || authLoading) {
	  return <div className="text-center py-8">Загрузка...</div>;
	}


  if (error) {
    return <div className="text-center py-8 text-red-600">{error}</div>;
  }

  // Проверка: если нет токена И это не клиент — просим залогиниться
  if (!authToken && !isClientAccess) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-700">
        <div className="flex items-center space-x-3 justify-center sm:justify-start w-full sm:w-auto">
          <img src={logo} alt="Логотип" className="h-12 w-auto" />
          <h1 className="text-xl font-bold">SEO Position Parser</h1>
        </div>
        <p>Пожалуйста, войдите в систему для доступа к приложению.</p>
        <button
          onClick={openAuth}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Войти
        </button>
        {isAuthOpen && <AuthModal onClose={closeAuth} onLoginSuccess={handleLoginSuccess} />}
      </div>
    );
  }

  // Основной рендер — хедер всегда + условно содержимое
  return (


    <div className="min-h-screen bg-gray-50">
      {/* Хедер */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 p-4 max-w-7xl mx-auto">
        <div className="flex items-center space-x-3 justify-center sm:justify-start w-full sm:w-auto">
          <img src={logo} alt="Логотип" className="h-12 w-auto" />
          <h1 className="text-xl font-bold">SEO Position Parser</h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center w-full sm:w-auto gap-2 sm:gap-4">
          {authToken || isClientAccess ? (
		  <>
		    {userRole === 'admin' && (
		      <button
		        onClick={openRegisterModal}
		        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
		      >
		        Регистрация менеджера
		      </button>
		    )}
		    {authToken && (
		      <button
		        onClick={handleLogout}
		        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
		      >
		        Выйти
		      </button>
		    )}
		  </>
		) : (
		  <button
		    onClick={openAuth}
		    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
		  >
		    Войти
		  </button>
		)}

        </div>
      </header>

      {/* Основной контент */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {currentView === 'dashboard' && !isClientAccess && (
          <Dashboard
            projects={projects}
            onCreateProject={() => setCurrentView('form')}
            onSelectProject={handleSelectProject}
            refreshProjects={refreshProjects}
            isClientView={false}
          />
        )}

        {currentView === 'form' && !isClientAccess && (
          <ProjectForm
            onSubmit={handleCreateProject}
            onCancel={() => setCurrentView('dashboard')}
          />
        )}

        {currentView === 'projectGroups' && selectedProject && (
          <ProjectGroups
			  project={selectedProject}
			  onBack={handleBackToDashboard}
			  onSelectGroup={handleSelectGroup}
			  refreshProject={refreshProject}
			  onProjectGroupLoaded={(updatedProject) => {
			    setSelectedProject(updatedProject);
			    setProjects(prev => prev.map(p => (p.id === updatedProject.id ? updatedProject : p)));
			  }}
			  isClientView={isClientAccess}
			/>
        )}

        {currentView === 'positionTable' && selectedProject && (
			  <div className="space-y-6 max-w-7xl mx-auto">
			    {!isClientAccess && selectedGroup && (
			      <button
			        onClick={handleBackToProjectGroups}
			        className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
			      >
			        ← Назад к группам
			      </button>
			    )}
			    <PositionTable
			      group={isClientAccess ? selectedProject.groups[0] || null : selectedGroup}
			    onGroupLoaded={(updatedGroup) => {
			      // Формируем обновлённый проект с новой группой
			      handleProjectGroupLoaded({
			        ...selectedProject,
			        groups: selectedProject.groups.map(g =>
			          g.id === updatedGroup.id ? updatedGroup : g
			        ),
			      });
			    }}
			    onUpdateGroup={(updatedGroup) => {
			      handleProjectGroupLoaded({
			        ...selectedProject,
			        groups: selectedProject.groups.map(g =>
			          g.id === updatedGroup.id ? updatedGroup : g
			        ),
			      });
			    }}
			    isClientView={isClientAccess}
		        domain={selectedProject.domain}
		        groups={selectedProject.groups}
			  />
          </div>
        )}
      </main>

      {/* Модалки */}
      {isRegisterModalOpen && (
        <RegisterManagerModal
          onClose={closeRegisterModal}
          onRegisterSuccess={handleRegisterSuccess}
          token={authToken!}
        />
      )}
      {showChangePasswordModal && authToken && (
        <ChangePasswordModal
          token={authToken}
          onClose={() => setShowChangePasswordModal(false)}
          onPasswordChanged={() => {
            setIsTemporaryPassword(false);
            alert('Пароль успешно изменён. Пожалуйста, войдите снова.');
            handleLogout();
          }}
        />
      )}
    </div>
  );
}

export default App;

