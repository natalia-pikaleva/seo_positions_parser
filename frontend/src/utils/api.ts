import { Project, ProjectCreate, KeywordUpdate } from './types';

import { API_BASE } from './config';

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

export async function updateKeyword(
  projectId: string,
  keywordId: string,
  keywordData: Partial<Omit<KeywordUpdate, 'id'>>
): Promise<KeywordUpdate> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/keywords/${keywordId}`, {
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
  projectId: string,
  keywordData: {
    keyword: string;
    price_top_1_3: number;
    price_top_4_5: number;
    price_top_6_10: number;
  }
): Promise<Keyword> => {
  const response = await fetch(`${API_BASE}/projects/${projectId}/keywords`, {
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

export const deleteKeyword = async (projectId: string, keywordId: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/projects/${projectId}/keywords/${keywordId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to delete keyword');
  }
};

export async function runPositionCheck(projectId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/check`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to start position check');
  return res.json();
}

export async function fetchPositions(projectId: string, period: string, offset: number = 0): Promise<Position[]> {
  const params = new URLSearchParams();
  params.append('period', period);
  params.append('offset', offset.toString());

  const response = await fetch(`${API_BASE}/projects/${projectId}/positions?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Ошибка загрузки позиций');
  }
  return response.json();
}

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
