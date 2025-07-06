import { KeywordData } from '../types';

import { HOST } from './config';

export const getPositionColor = (position: number | undefined): string => {
  if (!position) return 'bg-gray-100 text-gray-600';
  
  if (position >= 1 && position <= 3) return 'bg-green-100 text-green-800';
  if (position >= 4 && position <= 5) return 'bg-yellow-100 text-yellow-800';
  if (position >= 6 && position <= 10) return 'bg-gray-100 text-gray-800';
  return 'bg-red-100 text-red-800';
};

export const calculateCost = (position: number | undefined, pricing: KeywordData['pricing']): number => {
  if (!position) return 0;
  
  if (position >= 1 && position <= 3) return pricing.top1to3;
  if (position >= 4 && position <= 5) return pricing.top4to5;
  if (position >= 6 && position <= 10) return pricing.top6to10;
  return 0;
};

export const getTrendIcon = (trend: 'up' | 'down' | 'stable' | undefined): string => {
  switch (trend) {
    case 'up': return '↗';
    case 'down': return '↘';
    case 'stable': return '→';
    default: return '—';
  }
};

export const getTrendColor = (trend: 'up' | 'down' | 'stable' | undefined): string => {
  switch (trend) {
    case 'up': return 'text-green-600';
    case 'down': return 'text-red-600';
    case 'stable': return 'text-gray-600';
    default: return 'text-gray-400';
  }
};

export const generateClientLink = (projectClientLink: string): string => {
  return `${HOST}/client/${projectClientLink}`;
};