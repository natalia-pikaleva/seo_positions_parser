export interface Project {
  id: string;
  domain: string;
  keywords: KeywordData[];
  region: string;
  searchEngine: string;
  schedule: string;
  createdAt: string;
  clientLink: string;
}

export interface KeywordData {
  id: string;
  keyword: string;
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