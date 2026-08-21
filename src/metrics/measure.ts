export interface Measurements {
  rawBytes: number;
  outputBytes: number;
  rawEstimatedTokens: number;
  outputEstimatedTokens: number;
  reductionPercent: number;
}

function estimatedTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function measure(raw: string, output: string): Measurements {
  const rawBytes = Buffer.byteLength(raw);
  const outputBytes = Buffer.byteLength(output);
  const rawEstimatedTokens = estimatedTokens(raw);
  const outputEstimatedTokens = estimatedTokens(output);
  const reductionPercent =
    rawEstimatedTokens === 0
      ? 0
      : Math.max(0, Math.round((1 - outputEstimatedTokens / rawEstimatedTokens) * 100));

  return {
    rawBytes,
    outputBytes,
    rawEstimatedTokens,
    outputEstimatedTokens,
    reductionPercent,
  };
}

export function formatMeasurements(
  measurements: Measurements,
  durationMs?: number,
): string {
  const duration = durationMs === undefined ? "" : ` | ${durationMs}ms`;
  return `[shrink] ${measurements.rawBytes}B -> ${measurements.outputBytes}B | est. tokens ${measurements.rawEstimatedTokens} -> ${measurements.outputEstimatedTokens} | -${measurements.reductionPercent}%${duration}`;
}
