export interface DetailRow {
  service: string;
  partie: string;
  ensemble: string;
  detailLabel: string;
  consomme: number;
  fleche: number;
  sourceRows: number;
  resteADepenser: number | null; // null = non ventilable au niveau ligne
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
    consoColumns?: Record<string, string | null>;
    budgetColumns?: Record<string, string | null>;
    sheetsUsed: string[];
    sheetsIgnored: string[];
    servicesDetected: number;
    aggregationMs?: number;
  };
}
