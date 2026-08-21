export function limitLines(lines: string[], maxLines: number): {
  lines: string[];
  omitted: number;
} {
  if (lines.length <= maxLines) {
    return { lines, omitted: 0 };
  }

  const headCount = Math.ceil(maxLines * 0.65);
  const tailCount = Math.max(1, maxLines - headCount);
  const omitted = lines.length - headCount - tailCount;

  return {
    lines: [
      ...lines.slice(0, headCount),
      `... ${omitted} lines omitted ...`,
      ...lines.slice(-tailCount),
    ],
    omitted,
  };
}
