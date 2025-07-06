import React, { useState } from 'react';
import { Plus, Trash2, Globe, Search, MapPin, Clock } from 'lucide-react';
import { Project, KeywordData } from '../types';

interface ProjectFormProps {
  onSubmit: (project: Omit<Project, 'id' | 'createdAt' | 'clientLink'>) => void;
  onCancel: () => void;
}

export const ProjectForm: React.FC<ProjectFormProps> = ({ onSubmit, onCancel }) => {
  const [domain, setDomain] = useState('');
  const [keywords, setKeywords] = useState<Omit<KeywordData, 'id'>[]>([{
    keyword: '',
    region: 'Москва',
    pricing: { top1to3: 0, top4to5: 0, top6to10: 0 }
  }]);
  const [searchEngine, setSearchEngine] = useState('Яндекс');
  const [schedule, setSchedule] = useState('daily');

  const addKeyword = () => {
	  setKeywords([...keywords, {
	    keyword: '',
	    region: 'Москва', // регион по умолчанию
	    pricing: { top1to3: 0, top4to5: 0, top6to10: 0 }
	  }]);
	};


  const removeKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  const updateKeyword = (index: number, field: string, value: string | number) => {
	  const updated = [...keywords];
	  if (field === 'keyword') {
	    updated[index].keyword = value as string;
	  } else if (field === 'region') {
	    updated[index].region = value as string;
	  } else if (field.startsWith('pricing.')) {
	    const pricingField = field.split('.')[1] as keyof KeywordData['pricing'];
	    updated[index].pricing[pricingField] = Number(value);
	  }
	  setKeywords(updated);
	};


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      domain,
      keywords: keywords.map(k => ({ ...k, id: crypto.randomUUID() })),
      searchEngine,
      schedule
    });
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Search className="w-6 h-6 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">Создать новый проект</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Globe className="w-4 h-4" />
              Домен сайта
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4" />
              Поисковая система
            </label>
            <select
              value={searchEngine}
              onChange={(e) => setSearchEngine(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Яндекс">Яндекс</option>
              <option value="Google">Google</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Clock className="w-4 h-4" />
              Расписание
            </label>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="daily">Ежедневно в 12:00</option>
              <option value="weekly">Еженедельно</option>
              <option value="manual">Вручную</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Ключевые запросы и ценообразование</h3>
            <button
              type="button"
              onClick={addKeyword}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Добавить запрос
            </button>
          </div>

          <div className="space-y-4">
            {keywords.map((keyword, index) => (
			  <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
			    <div className="flex items-center justify-between mb-3">
			      <input
			        type="text"
			        value={keyword.keyword}
			        onChange={(e) => updateKeyword(index, 'keyword', e.target.value)}
			        placeholder="Введите ключевой запрос"
			        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
			        required
			      />
			      <select
			        value={keyword.region}
			        onChange={(e) => updateKeyword(index, 'region', e.target.value)}
			        className="ml-4 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
			      >
			        <option value="Москва">Москва</option>
			        <option value="Санкт-Петербург">Санкт-Петербург</option>
			        <option value="Новосибирск">Новосибирск</option>
			        <option value="Екатеринбург">Екатеринбург</option>
			      </select>
			      {keywords.length > 1 && (
			        <button
			          type="button"
			          onClick={() => removeKeyword(index)}
			          className="ml-3 p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
			        >
			          <Trash2 className="w-4 h-4" />
			        </button>
			      )}
			    </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      ТОП-1 до ТОП-3 (₽/день)
                    </label>
                    <input
                      type="number"
                      value={keyword.pricing.top1to3}
                      onChange={(e) => updateKeyword(index, 'pricing.top1to3', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      ТОП-4 до ТОП-5 (₽/день)
                    </label>
                    <input
                      type="number"
                      value={keyword.pricing.top4to5}
                      onChange={(e) => updateKeyword(index, 'pricing.top4to5', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      ТОП-6 до ТОП-10 (₽/день)
                    </label>
                    <input
                      type="number"
                      value={keyword.pricing.top6to10}
                      onChange={(e) => updateKeyword(index, 'pricing.top6to10', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4 pt-6">
          <button
            type="submit"
            className="flex-1 bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Создать проект
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
};