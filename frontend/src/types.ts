export interface DetailRow {
  service: string;
  partie: string;
  ensemble: string;
  detailLabel: string;
  budgetDedie: number;
  consomme: number;
  fleche: number;
  sourceRows: number;
  resteADepenser: number;
}

export interface ServiceView {
  service: string;
  budgetDedie: number;
  consomme: number;
  fleche: number;
  resteADepenser: number;
  avancement: number | null;
  isOverBudget: boolean;
  lignesDetail: DetailRow[];
}

export interface GlobalView {
  budgetDedie: number;
  consomme: number;
  fleche: number;
  resteADepenser: number;
  avancement: number | null;
  isOverBudget: boolean;
  totalBudgetDedie?: number;
  totalConsomme?: number;
  totalFleche?: number;
  totalResteADepenser?: number;
}

export interface BudgetResponse {
  source: string;
  fileUpdatedAt: string | null;
  generatedAt: string;
  global: GlobalView;
  services: ServiceView[];
  warnings: string[];
  cacheUsed: boolean;
  stats: {
    consoRowsParsed?: number;
    consoRowsKept?: number;
    budgetRowsParsed?: number;
    budgetRowsKept?: number;
    budgetDedieRowsWithValue?: number;
    consoColumns?: {
      service?: string | null;
      partie?: string | null;
      ensemble?: string | null;
      consomme?: string | null;
      fleche?: string | null;
    };
    budgetColumns?: {
      service?: string | null;
      partie?: string | null;
      ensemble?: string | null;
      budgetDedie?: string | null;
      budgetDedieSource?: 'header' | 'fallbackS';
    };
    sheetsUsed: string[];
    sheetsIgnored: string[];
    servicesDetected: number;
    aggregationMs?: number;
    budgetDedieSampleRows?: Array<{
      row: number; service: string; partie: string; ensemble: string;
      budgetDedie: number;
    }>;
  };
}
