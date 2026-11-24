export interface ReelCount {
  lengthM: number;
  count: number;
}

export interface ReelPlan {
  requiredMm: number;
  /** Загальна довжина закуплених бухт, мм. */
  purchasedMm: number;
  /** Залишок після використання (purchased − required), мм. */
  leftoverMm: number;
  reels: ReelCount[];
}

/**
 * Підбирає набір бухт, що покриває потрібну довжину з мінімальним перебором;
 * при однаковому перебрі обирає менше бухт.
 * Довжини бухт — цілі метри. Потрібна довжина округлюється вгору до метра.
 */
export function planReels(requiredMm: number, reelLengthsM: readonly number[]): ReelPlan {
  if (!Number.isInteger(requiredMm) || requiredMm < 0) {
    throw new Error("Потрібна довжина має бути невід'ємним цілим числом мм");
  }
  if (reelLengthsM.length === 0 || reelLengthsM.some((l) => !Number.isInteger(l) || l <= 0)) {
    throw new Error("Довжини бухт мають бути додатними цілими метрами");
  }
  if (requiredMm === 0) {
    return { requiredMm, purchasedMm: 0, leftoverMm: 0, reels: [] };
  }

  const lengths = [...new Set(reelLengthsM)].sort((a, b) => a - b);
  const maxLen = lengths[lengths.length - 1] as number;
  const needM = Math.ceil(requiredMm / 1000);
  // У вікні [needM, needM + maxLen] завжди є кратне maxLen, тож рішення існує.
  const limit = needM + maxLen;

  const minReels = new Array<number>(limit + 1).fill(Infinity);
  const lastReel = new Array<number>(limit + 1).fill(0);
  minReels[0] = 0;
  for (let total = 1; total <= limit; total++) {
    for (const len of lengths) {
      const prev = minReels[total - len];
      if (total - len >= 0 && prev !== undefined && prev + 1 < (minReels[total] as number)) {
        minReels[total] = prev + 1;
        lastReel[total] = len;
      }
    }
  }

  let purchasedM = needM;
  while (purchasedM <= limit && !Number.isFinite(minReels[purchasedM])) {
    purchasedM++;
  }

  const counts = new Map<number, number>();
  for (let rest = purchasedM; rest > 0; rest -= lastReel[rest] as number) {
    const len = lastReel[rest] as number;
    counts.set(len, (counts.get(len) ?? 0) + 1);
  }

  const reels = [...counts.entries()]
    .map(([lengthM, count]) => ({ lengthM, count }))
    .sort((a, b) => b.lengthM - a.lengthM);

  return {
    requiredMm,
    purchasedMm: purchasedM * 1000,
    leftoverMm: purchasedM * 1000 - requiredMm,
    reels,
  };
}
