export interface DailyEstimateConfig {
  defaultAssumedRepairKes: number;
  assumedTenorDays: number;
  assumedFactor: number;
}

export const DEFAULT_DAILY_ESTIMATE_CONFIG: DailyEstimateConfig = {
  defaultAssumedRepairKes: 20000,
  assumedTenorDays: 60,
  assumedFactor: 1.272,
};

export interface DailyEstimateInput {
  repairEstimateKes?: number;
  depositKes?: number;
  config?: DailyEstimateConfig;
}

export interface DailyEstimateOutput {
  financedAmountKes: number;
  dailyRepaymentKes: number;
  assumedTenorDays: number;
  indicativeLabel: string;
}

// Placeholder formula behind settings.daily_estimate_config (O3)
export function estimateDailyRepayment(input: DailyEstimateInput = {}): DailyEstimateOutput {
  const config = input.config ?? DEFAULT_DAILY_ESTIMATE_CONFIG;
  const repair = Math.max(0, Math.round(input.repairEstimateKes ?? config.defaultAssumedRepairKes));
  const deposit = Math.max(0, Math.round(input.depositKes ?? 0));
  const financedAmountKes = Math.max(0, repair - deposit);
  const tenor = Math.max(1, config.assumedTenorDays);
  const dailyRepaymentKes =
    financedAmountKes === 0 ? 0 : Math.round((financedAmountKes * config.assumedFactor) / tenor);

  return {
    financedAmountKes,
    dailyRepaymentKes,
    assumedTenorDays: tenor,
    indicativeLabel: "Indicative only. Final terms come from the lender.",
  };
}
