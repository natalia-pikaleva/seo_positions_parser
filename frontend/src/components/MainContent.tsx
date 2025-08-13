import React from 'react';

import { Dashboard } from './Dashboard';
import { ProjectForm } from './ProjectForm';
import { ProjectGroups } from './ProjectGroups';
import { PositionTable } from './PositionTable';

import { Project, Group } from '../types';

interface MainContentProps {
  currentView: string;
  isClientAccess: boolean;
  projects: Project[];
  selectedProject: Project | null;
  selectedGroup: Group | null;
  setCurrentView: (view: string) => void;
  onSelectProject: (project: Project) => Promise<void>;
  onSelectGroup: (group: Group) => Promise<void>;
  onBackToDashboard: () => void;
  onBackToProjectGroups: () => void;
  refreshProjects: () => Promise<Project[]>;
  refreshProject: () => Promise<Project | null>;
  onCreateProject: (data: Omit<Project, 'id' | 'createdAt' | 'clientLink'>) => Promise<void>;
  onUpdateProject: (project: Project) => Promise<void>;
  onDeleteProject: (projectId: string) => void;
  onProjectGroupLoaded: (project: Project) => void;
}

export const MainContent: React.FC<MainContentProps> = ({
  currentView,
  isClientAccess,
  projects,
  selectedProject,
  selectedGroup,
  setCurrentView,
  onSelectProject,
  onSelectGroup,
  onBackToDashboard,
  onBackToProjectGroups,
  refreshProjects,
  refreshProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onProjectGroupLoaded,
}) => {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {currentView === 'dashboard' && !isClientAccess && (
        <Dashboard
          projects={projects}
          onCreateProject={() => setCurrentView('form')}
          onSelectProject={onSelectProject}
          refreshProjects={refreshProjects}
          isClientView={false}
          onDeleteProject={onDeleteProject}
        />
      )}

      {currentView === 'form' && !isClientAccess && (
        <ProjectForm
          onSubmit={onCreateProject}
          onCancel={() => setCurrentView('dashboard')}
        />
      )}

      {currentView === 'projectGroups' && selectedProject && (
        <ProjectGroups
          project={selectedProject}
          onBack={onBackToDashboard}
          onSelectGroup={onSelectGroup}
          refreshProject={refreshProject}
          onProjectGroupLoaded={onProjectGroupLoaded}
          isClientView={isClientAccess}
        />
      )}

      {currentView === 'positionTable' && selectedProject && (
        <div className="space-y-6 max-w-7xl mx-auto">
          {!isClientAccess && selectedGroup && (
            <button
              onClick={onBackToProjectGroups}
              className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Назад к группам
            </button>
          )}
          <PositionTable
            group={isClientAccess ? selectedProject.groups[0] || null : selectedGroup}
            onGroupLoaded={(updatedGroup) => {
              // Формируем обновлённый проект с новой группой
              onProjectGroupLoaded({
                ...selectedProject,
                groups: selectedProject.groups.map(g =>
                  g.id === updatedGroup.id ? updatedGroup : g
                ),
              });
            }}
            onUpdateGroup={(updatedGroup) => {
              onProjectGroupLoaded({
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
  );
};
