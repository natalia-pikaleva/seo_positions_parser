import React, { useState, useEffect } from 'react';
import { Keyword, KeywordUpdate } from '../types';
import { enableKeywordCheck, disableKeywordCheck } from '../utils/api';

interface KeywordManagerProps {
  keywords: Keyword[];
  onAddKeyword: (keywordData: Omit<Keyword, 'id'>) => Promise<void>;
  onUpdateKeyword: (id: string, keywordData: Partial<KeywordUpdate>) => Promise<void>;
  onDeleteKeyword: (id: string) => Promise<void>;
}

const REGIONS = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург'];

function PriceInput({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  const [inputValue, setInputValue] = useState<string>(String(value));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;

    // Убираем все символы, кроме цифр
    val = val.replace(/\D/g, '');

    // Убираем ведущие нули, но оставляем один 0, если строка пустая
    val = val.replace(/^0+(?=\d)/, '');

    setInputValue(val);

    // Если пусто, считаем 0
    const numericVal = val === '' ? 0 : Number(val);
    onChange(numericVal);
  };

  // При изменении пропса value синхронизируем локальное состояние
  React.useEffect(() => {
    setInputValue(value === 0 ? '' : String(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={inputValue}
      onChange={handleChange}
      className="border border-gray-300 rounded px-3 py-2 w-full"
      placeholder="0"
    />
  );
}

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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">ТОП-1 до ТОП-3 (₽/день)</label>
              <PriceInput
				  value={formState.price_top_1_3}
				  onChange={val => setFormState({ ...formState, price_top_1_3: val })}
				/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">ТОП-4 до ТОП-5 (₽/день)</label>
              <PriceInput
                value={formState.price_top_4_5}
                onChange={val => setFormState({ ...formState, price_top_4_5: val })}
				/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">ТОП-6 до ТОП-10 (₽/день)</label>
              <PriceInput
                value={formState.price_top_6_10}
                onChange={val => setFormState({ ...formState, price_top_6_10: val })}
				/>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-4">
			  <button
			    onClick={save}
			    className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
			  >
			    Сохранить
			  </button>
			  <button
			    onClick={cancel}
			    className="w-full sm:w-auto bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
			  >
			    Отмена
			  </button>
		  </div>

        </div>
      )}

      {!isAdding && !editingKeyword && (
        <button
          onClick={startAdd}
          className="mb-4 sm:w-auto bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Добавить ключевое слово
        </button>
      )}

      <ul className="divide-y divide-gray-200 border border-gray-300 rounded max-h-64 overflow-y-auto">
		  {keywords.map(keyword => (
		    <li key={keyword.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center px-4 py-2 gap-2">
				  <div>
				    <div className="font-medium">{keyword.keyword}</div>
				    <div className="text-sm text-gray-600">
				      Регион: {keyword.region} | Цены: {keyword.price_top_1_3} ₽, {keyword.price_top_4_5} ₽, {keyword.price_top_6_10} ₽
				    </div>
				  </div>
				  <div className="flex flex-row flex-wrap gap-2 items-center mt-2 sm:mt-0">
		        <button
		          onClick={() => startEdit(keyword)}
		          className="text-blue-600 hover:text-blue-800"
		          title="Редактировать"
		        >
		          Изменить
		        </button>
		        <button
		          onClick={() => remove(keyword.id)}
		          className="text-red-600 hover:text-red-800"
		          title="Удалить"
		        >
		          Удалить
		        </button>
		        <button
				  onClick={async () => {
				    try {
				      if (keyword.is_check) {
				        await disableKeywordCheck(keyword.id);
				      } else {
				        await enableKeywordCheck(keyword.id);
				      }
				      await onUpdateKeyword(keyword.id, { is_check: !keyword.is_check });
				    } catch (error) {
				      alert('Не удалось изменить состояние снятия позиций');
				    }
				  }}
				  className={`px-3 py-1 rounded text-white ${
				    keyword.is_check ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
				  }`}
				  title={keyword.is_check ? 'Отключить снятие позиций' : 'Включить снятие позиций'}
				>
				  {keyword.is_check ? 'Отключить' : 'Включить'}
				</button>
		      </div>
		    </li>
		  ))}
		</ul>

    </div>
  );
};
