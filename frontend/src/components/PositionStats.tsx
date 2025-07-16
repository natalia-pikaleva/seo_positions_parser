import React from 'react';
import { TrendingUp, Star, Minus } from 'lucide-react';

interface Props {
  top1to3: number;
  top4to5: number;
  top6to10: number;
  totalKeywords: number;
}

export const PositionStats: React.FC<Props> = ({ top1to3, top4to5, top6to10, totalKeywords }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 mb-6">
    <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 sm:p-6 rounded-lg">
      <div className="flex items-center gap-2 sm:gap-3 mb-2">
        <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
        <span className="text-xs sm:text-sm font-medium text-gray-700">В ТОП-3</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-1">{top1to3}</div>
      <div className="text-xs sm:text-sm text-gray-600">из {totalKeywords} запросов</div>
    </div>

    <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-3 sm:p-6 rounded-lg">
      <div className="flex items-center gap-2 sm:gap-3 mb-2">
        <Star className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
        <span className="text-xs sm:text-sm font-medium text-gray-700">В ТОП-5</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-1">{top4to5}</div>
      <div className="text-xs sm:text-sm text-gray-600">из {totalKeywords} запросов</div>
    </div>

    <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-3 sm:p-6 rounded-lg">
      <div className="flex items-center gap-2 sm:gap-3 mb-2">
        <Minus className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
        <span className="text-xs sm:text-sm font-medium text-gray-700">В ТОП-10</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-yellow-600 mb-1">{top6to10}</div>
      <div className="text-xs sm:text-sm text-gray-600">из {totalKeywords} запросов</div>
    </div>
  </div>
);

