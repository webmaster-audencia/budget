export interface BudgetView {
  name: string;
  initial: number;
  consomme: number;
  fleche: number;
  reste: number;
  engagementRatio: number | null;
  isOverBudget: boolean;
  rowsCount: number;
}

export interface DetailRow {
  sheet: string;
  rowNum: number;
  service: string;
  budgetInitial: number;
  budgetConsomme: number;
  budgetFleche: number;
  resteADepenser: number;
}

export interface SheetStat {
  name: string;
  kept: number;
  ignored: number;
  empty: boolean;
  skipped: boolean;
}

export interface BudgetResponse {
  file: string;
  generatedAt: string;
  global: BudgetView;
  services: BudgetView[];
  details: DetailRow[];
  warnings: string[];
  stats: {
    rowsKept: number;
    rowsIgnored: number;
    budgetSheetsDetected: number;
    sheets: SheetStat[];
    outlineLevel1Total: number;
    outlineLevel1Kept: number;
    outlineLevelFallback: boolean;
  };
}
