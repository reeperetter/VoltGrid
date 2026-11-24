export type PhaseIndex = 0 | 1 | 2;

export interface PhaseLoad {
  id: string;
  /** Потужність однофазного навантаження (кола), Вт. */
  powerW: number;
  /** Якщо задано — коло вручну закріплене за фазою (0 = L1, 1 = L2, 2 = L3). */
  fixedPhase?: PhaseIndex;
}

export interface PhaseBalanceResult {
  assignment: Record<string, PhaseIndex>;
  /** Сумарна потужність по фазах L1, L2, L3, Вт. */
  totalsW: [number, number, number];
  /** Найбільше відхилення фази від середнього, % від середнього (0, якщо навантаження немає). */
  maxDeviationPercent: number;
}

/**
 * Жадібний розподіл кіл по трьох фазах: від найбільшого навантаження до найменшого,
 * кожне — на найменш завантажену фазу (за рівності — на фазу з меншим номером).
 * Закріплені вручну кола враховуються першими й не переміщуються.
 */
export function balancePhases(loads: readonly PhaseLoad[]): PhaseBalanceResult {
  const totalsW: [number, number, number] = [0, 0, 0];
  const assignment: Record<string, PhaseIndex> = {};

  const seen = new Set<string>();
  for (const load of loads) {
    if (!(load.powerW >= 0)) throw new Error(`Навантаження ${load.id}: потужність має бути невід'ємною`);
    if (seen.has(load.id)) throw new Error(`Повторний ідентифікатор кола: ${load.id}`);
    seen.add(load.id);
    if (load.fixedPhase !== undefined) {
      assignment[load.id] = load.fixedPhase;
      totalsW[load.fixedPhase] += load.powerW;
    }
  }

  const free = loads
    .filter((l) => l.fixedPhase === undefined)
    .sort((a, b) => b.powerW - a.powerW || a.id.localeCompare(b.id));

  for (const load of free) {
    let target: PhaseIndex = 0;
    for (const p of [1, 2] as const) {
      if (totalsW[p] < totalsW[target]) target = p;
    }
    assignment[load.id] = target;
    totalsW[target] += load.powerW;
  }

  const sum = totalsW[0] + totalsW[1] + totalsW[2];
  const mean = sum / 3;
  const maxDeviationPercent =
    mean === 0 ? 0 : (Math.max(...totalsW.map((t) => Math.abs(t - mean))) / mean) * 100;

  return { assignment, totalsW, maxDeviationPercent };
}
