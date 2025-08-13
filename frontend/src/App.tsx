import React, { useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';

import { Header } from './components/Header';
import { AuthGate } from './components/AuthGate';
import { MainContent } from './components/MainContent';
import { ModalsManager } from './components/ModalsManager';
import { EmployeesModal } from './components/EmployeesModal';
import { EditUserModal } from './components/EditUserModal';
import { CopyTextModal } from './components/CopyTextModal';

import { Project, Group } from './types';

import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
  fetchProject,
  fetchClientProjectByLink,
  fetchUsersWithProjects,
  deleteUser,
  updateUser
} from './utils/api';

interface JwtPayload {
  sub: string;
  role: string;
  exp: number;
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

  const [isClientAccess, setIsClientAccess] = useState(false);

  // Модалки регистрации и смены пароля
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerSuccessUsername, setRegisterSuccessUsername] = useState<string | null>(null);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const [employeesModalOpen, setEmployeesModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [usersList, setUsersList] = useState<UserOut[]>([]);

  const openEmployeesModal = () => setEmployeesModalOpen(true);
  const closeEmployeesModal = () => setEmployeesModalOpen(false);

  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [registerPassword, setRegisterPassword] = useState<string | null>(null);
  const [registerUsername, setRegisterUsername] = useState<string | null>(null);


  // Инициализация данных и авторизации
  useEffect(() => {
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
	        setCurrentView('positionTable');
	      } else {
	        setIsClientAccess(false);
	        if (savedToken) {
	          // Передаем token из savedToken, а не из виртуальной переменной token
	          const list = await fetchProjects(savedToken);
	          setProjects(list);
	        } else {
	          setProjects([]);
	        }
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


  // Обработчики выбора, обновления и возврата

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

  const handleSelectGroup = useCallback(
    async (group: Group) => {
      if (!selectedProject) return;
      setLoading(true);
      try {
        const updatedProject = await fetchProject(selectedProject.id);
        setSelectedProject(updatedProject);
        const foundGroup = updatedProject.groups.find((g) => g.id === group.id) || null;
        setSelectedGroup(foundGroup);
        setCurrentView('positionTable');
      } catch (e) {
        alert('Не удалось загрузить проект');
      } finally {
        setLoading(false);
      }
    },
    [selectedProject],
  );

  const handleBackToDashboard = useCallback(() => {
    setSelectedProject(null);
    setSelectedGroup(null);
    setCurrentView('dashboard');
  }, []);

  const handleBackToProjectGroups = useCallback(() => {
    setSelectedGroup(null);
    setCurrentView('projectGroups');
  }, []);

  const refreshProjects = useCallback(async (token: string) => {
    try {
	    if (!token) {
	      setProjects([]);
	      return [];
	    }
	    const list = await fetchProjects(token);
	    setProjects(list);
	    return list;
	  } catch {
	    return [];
	  }
	}, []);


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

  const handleCreateProject = async (
	projectData: Omit<Project, 'id' | 'createdAt' | 'clientLink'>,
	) => {
	  try {
	    if (!authToken) {
	      alert('Пожалуйста, авторизуйтесь');
	      return;
	    }
	    const newProject = await createProject(projectData, authToken);
	    setProjects((prev) => [...prev, newProject]);
	    setCurrentView('dashboard');
	  } catch (e) {
	    console.error(e);
	    alert('Не удалось создать проект');
	  }
	};


  const handleUpdateProject = async (updatedProject: Project) => {
    try {
      const project = await updateProject(updatedProject.id, updatedProject);
      setProjects((prev) => prev.map((p) => (p.id === project.id ? project : p)));
      setSelectedProject(project);
    } catch (e) {
      console.error(e);
      alert('Не удалось обновить проект');
    }
  };

  const handleDeleteProject = useCallback(async (projectId: string) => {
    if (!authToken) {
	    alert('Пожалуйста, авторизуйтесь');
	    return;
	  }

    setLoading(true);
	  try {
	    await deleteProject(projectId, authToken);
	    setProjects(prev => prev.filter(p => p.id !== projectId));
	    // Если сейчас выбран удаляемый проект — сбросить selection
	    if (selectedProject?.id === projectId) {
	      setSelectedProject(null);
	      setSelectedGroup(null);
	      setCurrentView('dashboard');
	    }
	  } catch (error: any) {
	    console.error('Ошибка при удалении проекта:', error);
	    alert(error.message || 'Не удалось удалить проект');
	  } finally {
	    setLoading(false);
	  }
	}, [authToken, selectedProject]);


  const handleProjectGroupLoaded = (updatedProject: Project) => {
    setSelectedProject(updatedProject);
    setProjects((prev) => prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)));
  };

  // Логин, логаут, управление состоянием модалок

  const handleLoginSuccess = async (token: string, isTemp: boolean) => {
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

	  // Загрузить проекты сразу после установки токена
	  await refreshProjects(token);
};

  const handleLogout = () => {
    setAuthToken(null);
    setUserRole(null);
    setIsTemporaryPassword(false);
    localStorage.clear();
    setCurrentView('dashboard');
    setSelectedProject(null);
    setSelectedGroup(null);
  };

  const openAuth = () => setIsAuthOpen(true);
  const closeAuth = () => setIsAuthOpen(false);

  const openRegisterModal = () => {
    setRegisterSuccessUsername(null);
    setIsRegisterModalOpen(true);
    setEmployeesModalOpen(false);
  };
  const closeRegisterModal = () => {
  setIsRegisterModalOpen(false);
  setEmployeesModalOpen(true);
};

  const handleRegisterSuccess = (username: string, temporaryPassword: string) => {
    setRegisterUsername(username);
    setRegisterPassword(temporaryPassword);
    setIsRegisterModalOpen(false);
    setEmployeesModalOpen(true);
    setCopyModalVisible(true);
  };


  // Обработка редактирования пользователя через модалку
  const handleEditUser = (user: UserOut) => {
    setUserToEdit(user);
    setEditUserModalOpen(true);
  };

  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const closeEditUserModal = () => {
    setEditUserModalOpen(false);
    setUserToEdit(null);
  };

  // Здесь вызываем функцию updateUser из api при сохранении изменений пользователя
  const handleUserSave = async (updatedUser: UserOut | User) => {
    if (!authToken || !updatedUser.id) return;

    // Формируем объект для updateUser (UserUpdateRequest)
    const updateData: UserUpdateRequest = {
      fullname: (updatedUser as UserOut).fullname || null,
      role: (updatedUser as UserOut).role,
      project_ids: (updatedUser as UserOut).projects
        ? (updatedUser.projects as { id: string }[]).map(p => p.id)
        : undefined,
    };

    try {
      const updated = await updateUser(updatedUser.id, updateData, authToken);
      // Обновляем список сотрудников локально, подменяя отредактированного пользователя
      setUsersList(prevList =>
        prevList.map(u => (u.id === updated.id ? updated : u))
      );

      alert('Пользователь успешно обновлён');
    } catch (err: any) {
      console.error('Ошибка обновления пользователя:', err);
      alert(err.message || 'Ошибка обновления пользователя');
    }
  };


  // Рендер

  return (
    <>
      <AuthGate
        loading={loading || authLoading}
        error={error}
        authToken={authToken}
        isClientAccess={isClientAccess}
        isAuthOpen={isAuthOpen}
        onOpenAuth={openAuth}
        onCloseAuth={closeAuth}
        onLoginSuccess={handleLoginSuccess}
      />

      {(authToken || isClientAccess) && (
        <div className="min-h-screen bg-gray-50">
          <Header
	        userRole={userRole}
	        authToken={authToken}
	        isClientAccess={isClientAccess}
	        onLogout={handleLogout}
	        onOpenRegisterModal={openRegisterModal}
	        onOpenAuth={openAuth}
	        onOpenEmployeesModal={openEmployeesModal}
	      />

          <MainContent
            currentView={currentView}
            isClientAccess={isClientAccess}
            projects={projects}
            selectedProject={selectedProject}
            selectedGroup={selectedGroup}
            setCurrentView={setCurrentView}
            onSelectProject={handleSelectProject}
            onSelectGroup={handleSelectGroup}
            onBackToDashboard={handleBackToDashboard}
            onBackToProjectGroups={handleBackToProjectGroups}
            refreshProjects={refreshProjects}
            refreshProject={refreshProject}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onProjectGroupLoaded={handleProjectGroupLoaded}
            onDeleteProject={handleDeleteProject}
          />

          <ModalsManager
            isRegisterOpen={isRegisterModalOpen}
            onCloseRegister={closeRegisterModal}
            onRegisterSuccess={handleRegisterSuccess}
            registerToken={authToken}
            showChangePasswordModal={showChangePasswordModal}
            onCloseChangePassword={() => setShowChangePasswordModal(false)}
            changePasswordToken={authToken}
            onPasswordChanged={() => {
              setIsTemporaryPassword(false);
              alert('Пароль успешно изменён. Пожалуйста, войдите снова.');
              handleLogout();
            }}
          />
        </div>
      )}

      {employeesModalOpen && authToken && (
	    <EmployeesModal
		    token={authToken}
		    onClose={closeEmployeesModal}
		    onOpenRegisterModal={openRegisterModal}
		    fetchUsers={fetchUsersWithProjects}
		    deleteUser={deleteUser}
		    onEditUser={handleEditUser}
		    users={usersList}
		    setUsers={setUsersList}
		  />
		)}

      {editUserModalOpen && userToEdit && authToken && (
        <EditUserModal
		  token={authToken}
		  user={userToEdit}
		  onClose={closeEditUserModal}
		  onSave={handleUserSave}
		  updateUser={updateUser}
		  fetchProjects={fetchProjects}
		/>
      )}

      <CopyTextModal
		  visible={copyModalVisible}
		  onClose={() => setCopyModalVisible(false)}
		  username={registerUsername || ''}
		  temporaryPassword={registerPassword || ''}
		/>

    </>
  );
}

export default App;
