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

export interface SheetStat {
  name: string;
  kept: number;
  ignored: number;
  empty: boolean;
}

export interface BudgetResponse {
  file: string;
  generatedAt: string;
  global: BudgetView;
  services: BudgetView[];
  warnings: string[];
  stats: {
    rowsKept: number;
    rowsIgnored: number;
    sheets: SheetStat[];
    outlineLevel1Total: number;
    outlineLevel1Kept: number;
    outlineLevelFallback: boolean;
  };
}
