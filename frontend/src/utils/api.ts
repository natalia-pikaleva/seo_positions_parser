import { Project, ProjectCreate, KeywordUpdate, Group, GroupCreate, GroupUpdate } from './types';

import { API_BASE } from './config';

// -- проекты
export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`);
  if (!res.ok) throw new Error('Failed to fetch project');
  return res.json();
}

export async function createProject(project: ProjectCreate): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}

export async function updateProject(id: string, project: Partial<ProjectCreate>): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error('Failed to update project');
  return res.json();
}

export async function runProjectParsing(projectId: string): Promise<{message: string}> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    let errorText = 'Failed to start project parsing';
    try {
      const errorJson = await res.json();
      if (errorJson?.detail) errorText = errorJson.detail;
    } catch {}
    throw new Error(errorText);
  }
  return res.json();
}

// --- группы

// Получить данные группы
export async function fetchGroup(groupId: string): Promise<Group> {
  const res = await fetch(`${API_BASE}/groups/${groupId}`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Group not found');
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to fetch group');
  }

  return res.json();
}

// Создать новую группу
export async function createGroup(group: GroupCreate): Promise<Project> {
  const res = await fetch(`${API_BASE}/groups/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(group),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to create group');
  }
  return res.json();
}

// Обновить существующую группу
export async function updateGroup(
  groupId: string,
  groupData: Partial<GroupUpdate>
): Promise<Project> {
  const res = await fetch(`${API_BASE}/groups/${groupId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(groupData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update group');
  }
  return res.json();
}

// Удалить группу
export async function deleteGroup(groupId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/groups/${groupId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to delete group');
  }
}

// -- ключи

export async function updateKeyword(
  groupId: string,
  keywordId: string,
  keywordData: Partial<Omit<KeywordUpdate, 'id'>>
): Promise<KeywordUpdate> {
  const res = await fetch(`${API_BASE}/groups/${groupId}/keywords/${keywordId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(keywordData),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update keyword');
  }

  return res.json();
}

export const createKeyword = async (
  groupId: string,
  keywordData: {
    keyword: string;
    price_top_1_3: number;
    price_top_4_5: number;
    price_top_6_10: number;
  }
): Promise<Keyword> => {
  const response = await fetch(`${API_BASE}/groups/${groupId}/keywords`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(keywordData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Failed to create keyword');
  }

  return response.json();
};

export const deleteKeyword = async (groupId: string, keywordId: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/groups/${groupId}/keywords/${keywordId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to delete keyword');
  }
};

// --- позиции

export async function runPositionCheck(projectId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/check`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to start position check');
  return res.json();
}

export async function fetchPositions(groupId: string, period: string, offset: number = 0): Promise<Position[]> {
  const params = new URLSearchParams();
  params.append('period', period);
  params.append('offset', offset.toString());

  const response = await fetch(`${API_BASE}/groups/${groupId}/positions?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Ошибка загрузки позиций');
  }
  return response.json();
}

interface IntervalSumOut {
  start_date: string;
  end_date: string;
  display_start_date: string;
  display_end_date: string;
  sum_cost: number;
}

interface KeywordIntervals {
  keyword_id: string;
  intervals: IntervalSumOut[];
}

export async function fetchPositionsIntervals(
  groupId: string,
  period: string,
  offset: number = 0
): Promise<KeywordIntervals[]> {
  const params = new URLSearchParams();
  params.append('period', period);
  params.append('offset', offset.toString());

  const response = await fetch(`${API_BASE}/groups/${groupId}/positions/intervals?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Ошибка загрузки агрегированных сумм позиций');
  }
  return response.json();
}

// --- ссылка клиента
export async function fetchClientProjectByLink(clientLink: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/client/${clientLink}`);
  if (!res.ok) {
    throw new Error('Проект не найден');
  }
  return res.json();
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  is_temporary_password: boolean;
}

// --- регистрация. авторизация, смена пароля

export async function loginUser(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || 'Ошибка авторизации');
  }

  const data = await response.json();
  return data as LoginResponse;
}

export interface RegisterManagerRequest {
  username: string;
  temporary_password?: string; // по умолчанию можно не передавать, тогда backend ставит пароль равным username
}


export async function registerManager(data: RegisterManagerRequest, token: string): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/managers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,  // передаём токен
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Ошибка регистрации менеджера');
  }
}

export async function changePassword(token: string, data: { old_password: string; new_password: string }) {
  const response = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Ошибка смены пароля');
  }

  return await response.json();
}


export async function exportPositionsExcel(
  projectId: string,
  startDate: string, // формат 'YYYY-MM-DD'
  endDate: string
): Promise<Blob> {
  const url = new URL(`${API_BASE}/projects/${projectId}/positions/export`);
  url.searchParams.append('start_date', startDate);
  url.searchParams.append('end_date', endDate);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });

  if (!response.ok) {
    throw new Error(`Ошибка при экспорте: ${response.statusText}`);
  }

  return await response.blob();
}


// Функция для включения is_check = true
export async function enableKeywordCheck(keywordId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/groups/keywords/${keywordId}/enable`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to enable keyword check: ${errorText}`);
  }
}

// Функция для отключения is_check = false
export async function disableKeywordCheck(keywordId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/groups/keywords/${keywordId}/disable`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to disable keyword check: ${errorText}`);
  }
}


//Запрашивает статус задачи run_main_task на указанную дату
export async function fetchTaskStatusByDate(dateStr?: string): Promise<any> {
  // Формируем URL с параметром date_str, если передан
  let url = `${API_BASE}/task-status/`;
  if (dateStr) {
    url += `?date_str=${encodeURIComponent(dateStr)}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch task status: ${errorText}`);
  }

  const data = await response.json();
  return data;
}
