import React, { useState } from 'react';
import { BarChart, Users, TrendingUp, Calendar, Plus } from 'lucide-react';
import { Project } from '../types';

interface DashboardProps {
  projects: Project[];
  onCreateProject: () => void;
  onSelectProject: (project: Project) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ projects, onCreateProject, onSelectProject }) => {
  const totalKeywords = projects.reduce((sum, project) => sum + project.keywords.length, 0);
  const totalCost = projects.reduce((sum, project) => 
    sum + project.keywords.reduce((keywordSum, keyword) => keywordSum + (keyword.cost || 0), 0), 0
  );
  const activeProjects = projects.length;

  return (
    <div className="space-y-6">
      {/* Заголовок + кнопка */}
	  <div className="flex flex-col sm:flex-row
                items-center sm:items-center
                justify-center sm:justify-between
                gap-4 text-center sm:text-left">
		  <div>
		    <h1 className="text-3xl font-bold text-gray-900">SEO Позиции</h1>
		    <p className="text-gray-600">Мониторинг позиций сайтов в поисковых системах</p>
		  </div>
		  <button
		    onClick={onCreateProject}
		    className="w-full sm:w-auto flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
		  >
		    <Plus className="w-5 h-5" />
		    Создать проект
		  </button>
	  </div>


      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Активные проекты</p>
              <p className="text-2xl font-bold text-gray-900">{activeProjects}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Ключевые запросы</p>
              <p className="text-2xl font-bold text-gray-900">{totalKeywords}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Users className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Общая стоимость</p>
              <p className="text-2xl font-bold text-gray-900">{totalCost.toLocaleString()} ₽</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Последняя проверка</p>
              <p className="text-sm font-bold text-gray-900">Сегодня, 12:00</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Проекты</h2>
        </div>
        <div className="p-6">
          {projects.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <BarChart className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Нет проектов</h3>
              <p className="text-gray-600 mb-6">Создайте первый проект для мониторинга позиций</p>
              <button
                onClick={onCreateProject}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Создать проект
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onSelectProject(project)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">{project.domain}</h3>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{project.keywords.length} запросов</span>
                    <span>{project.searchEngine}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm">
                      <span className="text-gray-600">Стоимость: </span>
                      <span className="font-medium text-gray-900">
                        {project.keywords.reduce((sum, k) => sum + (k.cost || 0), 0).toLocaleString()} ₽
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(project.createdAt).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};