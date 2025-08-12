export interface KeywordData {
  id: string;
  keyword: string;
  is_check: boolean;
  is_check: boolean;
  pricing: {
    top1to3: number;
    top4to5: number;
    top6to10: number;
  };
  currentPosition?: number;
  previousPosition?: number;
  lastChecked?: string;
  cost?: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface KeywordCreate {
  keyword: string;
  region: string;
  price_top_1_3: number;
  price_top_4_5: number;
  price_top_6_10: number;
}

export interface KeywordUpdate {
  keyword?: string;
  region?: string;
  price_top_1_3?: number;
  price_top_4_5?: number;
  price_top_6_10?: number;
  is_check?: boolean;
}

export interface PositionHistory {
  date: string;
  position: number;
  cost: number;
}

export interface FilterOptions {
  period: 'week' | 'month' | 'custom';
  startDate?: string;
  endDate?: string;
}

// Базовые данные группы (аналог GroupBase)
export interface GroupBase {
  title: string;
  region: string;
  searchEngine: SearchEngineEnum;
  topvisorId?: number; // optional, может быть undefined
}

// Для создания группы (аналог GroupCreate)
export interface GroupCreate extends GroupBase {
  projectId: string; // UUID проекта в виде строки
}

// Для обновления группы (аналог GroupUpdate)
export interface GroupUpdate {
  title?: string;
  region?: string;
  searchEngine?: SearchEngineEnum;
  topvisorId?: number;
  projectId?: string;
}

// Вывод данных группы (аналог GroupOut)
export interface Group extends GroupBase {
  id: string;
  keywords: KeywordData[];
}

export interface Project {
  id: string;
  domain: string;
  schedule: string;
  topvisorId?: number;
  createdAt: string;
  clientLink: string;
  groups: Group[];
}
