import React, { useState, useEffect } from 'react';
import { Keyword, KeywordUpdate, Group } from '../types';
import { enableKeywordCheck, disableKeywordCheck } from '../utils/api';

interface KeywordManagerProps {
  keywords: Keyword[];
  groups: Group[]; // передаем список групп проекта для выбора
  onAddKeyword: (keywordData: Omit<Keyword, 'id'>) => Promise<void>;
  onUpdateKeyword: (id: string, keywordData: Partial<KeywordUpdate>) => Promise<void>;
  onDeleteKeyword: (id: string) => Promise<void>;
}

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
  groups,
  onAddKeyword,
  onUpdateKeyword,
  onDeleteKeyword,
}) => {
  const [editingKeyword, setEditingKeyword] = useState<Keyword | null>(null);
  const [formState, setFormState] = useState<Omit<Keyword, 'id'>>({
    keyword: '',
    price_top_1_3: 0,
    price_top_4_5: 0,
    price_top_6_10: 0,
    priority: false,
  });
  const [isAdding, setIsAdding] = useState(false);

  const [keywordToMove, setKeywordToMove] = useState<Keyword | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);

  useEffect(() => {
    if (editingKeyword) {
      setFormState({
        keyword: editingKeyword.keyword,
        price_top_1_3: editingKeyword.price_top_1_3 || 0,
        price_top_4_5: editingKeyword.price_top_4_5 || 0,
        price_top_6_10: editingKeyword.price_top_6_10 || 0,
        priority: editingKeyword.priority || false,
      });
    }
  }, [editingKeyword]);

  const startMoveKeyword = (keyword: Keyword) => {
    setKeywordToMove(keyword);
    setTargetGroupId('');
    setShowMoveConfirm(false);
  };

  // Обработчик выбора группы для переноса
  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetGroupId(e.target.value);
  };

  // Подтверждение переноса
  const confirmMove = () => {
    if (!targetGroupId) {
      alert('Пожалуйста, выберите группу для переноса');
      return;
    }
    setShowMoveConfirm(true);
  };

  // Отправка запроса на перенос группы
  const performMove = async () => {
    if (!keywordToMove) return;
    try {
      // Вызываем onUpdateKeyword, меняя group_id на targetGroupId
      await onUpdateKeyword(keywordToMove.id, {
        group_id: targetGroupId,
      });
      alert('Ключевое слово успешно перенесено');
      setKeywordToMove(null);
      setTargetGroupId('');
      setShowMoveConfirm(false);
    } catch (error: any) {
      alert(error.message || 'Ошибка при переносе ключевого слова');
    }
  };

  const startAdd = () => {
    setIsAdding(true);
    setEditingKeyword(null);
    setFormState({
      keyword: '',
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
	      price_top_1_3: formState.price_top_1_3,
	      price_top_4_5: formState.price_top_4_5,
	      price_top_6_10: formState.price_top_6_10,
	      priority: formState.priority,
	    });
	  } else if (editingKeyword) {
	    await onUpdateKeyword(editingKeyword.id, {
	      keyword: trimmed,
	      price_top_1_3: formState.price_top_1_3,
	      price_top_4_5: formState.price_top_4_5,
	      price_top_6_10: formState.price_top_6_10,
	      priority: formState.priority,
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
    <div className="mb-6 flex flex-col h-full min-h-0">
      <h3 className="text-lg font-semibold mb-2">Ключевые слова</h3>

      {(isAdding || editingKeyword) && (
        <div className="space-y-4 mb-4 p-4 border border-gray-300 rounded bg-gray-50">
          {isAdding ? (
			<input
			    type="text"
			    className="border border-gray-300 rounded px-3 py-2 w-full"
			    value={formState.keyword}
			    onChange={e => setFormState({ ...formState, keyword: e.target.value })}
			    placeholder="Введите ключевое слово"
			  />
			) : (
			  <div className="px-3 py-2 bg-gray-100 rounded border border-gray-300 w-full select-none">
			    {formState.keyword}
			  </div>
			)}


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

          <div className="mt-4">
			  <label className="inline-flex items-center">
			    <input
			      type="checkbox"
			      checked={formState.priority}
			      onChange={e => setFormState({ ...formState, priority: e.target.checked })}
			      className="form-checkbox h-5 w-5 text-blue-600"
			    />
			    <span className="ml-2">Приоритет</span>
			  </label>
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
          className="mb-4 w-auto self-start sm:w-auto bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Добавить ключевое слово
        </button>
      )}

      <ul className="divide-y divide-gray-200 border border-gray-300 rounded overflow-y-auto flex-grow min-h-0">
		  {keywords.map(keyword => (
		    <li key={keyword.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center px-4 py-2 gap-2">
				  <div>
				    <div className="font-medium">{keyword.keyword}</div>
				    <div className="text-sm text-gray-600">
					  Цены: {keyword.price_top_1_3} ₽, {keyword.price_top_4_5} ₽, {keyword.price_top_6_10} ₽, приоритет: {keyword.priority ? 'да' : 'нет'}
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
				<button
	                onClick={() => startMoveKeyword(keyword)}
	                className="text-indigo-600 hover:text-indigo-800"
	                title="Перенести ключевой запрос"
	              >
	                Перенести ключевой запрос в другую группу
                </button>
		      </div>
		    </li>
		  ))}
		</ul>

		{/* Модалка выбора группы и подтверждения переноса */}
      {keywordToMove && !showMoveConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div
            className="bg-white rounded p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-4">Выберите группу для переноса ключевого слова</h3>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
              value={targetGroupId}
              onChange={handleGroupChange}
            >
              <option value="">-- Выберите группу --</option>
              {groups
                .filter(g => g.id !== keywordToMove.group_id) // исключаем текущую группу
                .map(group => (
                  <option key={group.id} value={group.id}>
                    {group.title}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setKeywordToMove(null)}
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
              >
                Отмена
              </button>
              <button
                onClick={confirmMove}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                disabled={!targetGroupId}
              >
                Далее
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка подтверждения переноса */}
      {keywordToMove && showMoveConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div
            className="bg-white rounded p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-4">Подтверждение переноса</h3>
            <p>Вы уверены, что хотите перенести ключевое слово &laquo;{keywordToMove.keyword}&raquo; в группу &laquo;{groups.find(g => g.id === targetGroupId)?.title}&raquo;?</p>
            <div className="flex justify-end gap-4 mt-4">
              <button
                onClick={() => setShowMoveConfirm(false)}
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
              >
                Назад
              </button>
              <button
                onClick={performMove}
                className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
              >
                Перенести
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
