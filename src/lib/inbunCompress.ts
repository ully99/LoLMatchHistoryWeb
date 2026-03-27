/**
 * 원시 인분을 1.0 근처로 압축해 표시 범위를 ~0.55–1.85 근처로 맞춘다 (선형·단조).
 */
export function compressInbunDisplay(raw: number): number {
  const k = 0.42;
  const v = 1 + (raw - 1) * k;
  return Math.min(1.85, Math.max(0.55, v));
}
