import React, { useState, useEffect } from 'react';
import { Keyword, KeywordUpdate } from '../types';

interface KeywordManagerProps {
  keywords: Keyword[];
  onAddKeyword: (keywordData: Omit<Keyword, 'id'>) => Promise<void>;
  onUpdateKeyword: (id: string, keywordData: Partial<KeywordUpdate>) => Promise<void>;
  onDeleteKeyword: (id: string) => Promise<void>;
}

const REGIONS = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург'];

export const KeywordManager: React.FC<KeywordManagerProps> = ({
  keywords,
  onAddKeyword,
  onUpdateKeyword,
  onDeleteKeyword,
}) => {
  const [editingKeyword, setEditingKeyword] = useState<Keyword | null>(null);
  const [formState, setFormState] = useState<Omit<Keyword, 'id'>>({
    keyword: '',
    region: 'Москва',
    price_top_1_3: 0,
    price_top_4_5: 0,
    price_top_6_10: 0,
  });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (editingKeyword) {
      setFormState({
        keyword: editingKeyword.keyword,
        region: editingKeyword.region || 'Москва',
        price_top_1_3: editingKeyword.price_top_1_3 || 0,
        price_top_4_5: editingKeyword.price_top_4_5 || 0,
        price_top_6_10: editingKeyword.price_top_6_10 || 0,
      });
    }
  }, [editingKeyword]);

  const startAdd = () => {
    setIsAdding(true);
    setEditingKeyword(null);
    setFormState({
      keyword: '',
      region: 'Москва',
      price_top_1_3: 0,
      price_top_4_5: 0,
      price_top_6_10: 0,
    });
  };

  const startEdit = (keyword: Keyword) => {
    setEditingKeyword(keyword);
    setIsAdding(false);
  };

  const cancel = () => {
    setEditingKeyword(null);
    setIsAdding(false);
    setFormState({
      keyword: '',
      region: 'Москва',
      price_top_1_3: 0,
      price_top_4_5: 0,
      price_top_6_10: 0,
    });
  };

  const save = async () => {
    const trimmed = formState.keyword.trim();
    if (!trimmed) {
      alert('Введите ключевое слово');
      return;
    }

    console.log('Saving keyword:', editingKeyword?.id, formState);

    try {
      if (isAdding) {
        await onAddKeyword({
          keyword: trimmed,
          region: formState.region,
          price_top_1_3: formState.price_top_1_3,
          price_top_4_5: formState.price_top_4_5,
          price_top_6_10: formState.price_top_6_10,
        });
      } else if (editingKeyword) {
        await onUpdateKeyword(editingKeyword.id, {
          keyword: trimmed,
          region: formState.region,
          price_top_1_3: formState.price_top_1_3,
          price_top_4_5: formState.price_top_4_5,
          price_top_6_10: formState.price_top_6_10,
        });
      }
      cancel();
    } catch (error: any) {
      console.error('Ошибка при обновлении ключевых слов', error);
      alert(error.message || 'Не удалось сохранить изменения');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Вы уверены, что хотите удалить ключевое слово?')) return;
    try {
      await onDeleteKeyword(id);
      if (editingKeyword?.id === id) cancel();
    } catch (error) {
      console.error('Ошибка при удалении ключевого слова', error);
      alert('Не удалось удалить ключевое слово');
    }
  };

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-2">Ключевые слова</h3>

      {(isAdding || editingKeyword) && (
        <div className="space-y-4 mb-4 p-4 border border-gray-300 rounded bg-gray-50">
          <input
            type="text"
            className="border border-gray-300 rounded px-3 py-2 w-full"
            value={formState.keyword}
            onChange={e => setFormState({ ...formState, keyword: e.target.value })}
            placeholder="Введите ключевое слово"
          />

          <select
            value={formState.region}
            onChange={e => setFormState({ ...formState, region: e.target.value })}
            className="border border-gray-300 rounded px-3 py-2 w-full"
          >
            {REGIONS.map(region => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">ТОП-1 до ТОП-3 (₽/день)</label>
              <input
                type="number"
                min={0}
                value={formState.price_top_1_3}
                onChange={e => setFormState({ ...formState, price_top_1_3: Number(e.target.value) })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">ТОП-4 до ТОП-5 (₽/день)</label>
              <input
                type="number"
                min={0}
                value={formState.price_top_4_5}
                onChange={e => setFormState({ ...formState, price_top_4_5: Number(e.target.value) })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">ТОП-6 до ТОП-10 (₽/день)</label>
              <input
                type="number"
                min={0}
                value={formState.price_top_6_10}
                onChange={e => setFormState({ ...formState, price_top_6_10: Number(e.target.value) })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={save}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Сохранить
            </button>
            <button
              onClick={cancel}
              className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {!isAdding && !editingKeyword && (
        <button
          onClick={startAdd}
          className="mb-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Добавить ключевое слово
        </button>
      )}

      <ul className="divide-y divide-gray-200 border border-gray-300 rounded">
        {keywords.map(keyword => (
          <li key={keyword.id ?? keyword.keyword} className="flex justify-between items-center px-4 py-2">
            <div>
              <div className="font-medium">{keyword.keyword}</div>
              <div className="text-sm text-gray-600">
                Регион: {keyword.region} | Цены: {keyword.price_top_1_3} ₽, {keyword.price_top_4_5} ₽, {keyword.price_top_6_10} ₽
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(keyword)} className="text-blue-600 hover:text-blue-800" title="Редактировать">
                Изменить
              </button>
              <button onClick={() => remove(keyword.id)} className="text-red-600 hover:text-red-800" title="Удалить">
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
