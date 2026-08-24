import { Tooltip } from "@heroui/react";
import { formatInteger, type DailyStatsRow } from "../lib/stats";

const LEVEL_COLORS = ["#edf1f4", "#b7e4c7", "#71c993", "#309d62", "#176b41"];
const LEVEL_BORDERS = ["#dce3e8", "#dce3e8", "#63bd85", "#258d54", "#125c36"];
const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface HeatmapCell {
  dateKey: string;
  saved: number;
  level: number;
}

function buildCells(rows: DailyStatsRow[]): { cells: HeatmapCell[]; leading: number } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 364);

  const dailySavings = new Map(rows.map((row) => [row.date, row.estimatedTokensSaved]));
  const maxSaved = Math.max(1, ...rows.map((row) => row.estimatedTokensSaved).filter((value) => value > 0));

  const cells = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateKey = utcDateKey(date);
    const saved = dailySavings.get(dateKey) ?? 0;
    const level = saved === 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((saved / maxSaved) * 4)));
    return { dateKey, saved, level };
  });

  return { cells, leading: start.getUTCDay() };
}

function swatchStyle(level: number) {
  return { background: LEVEL_COLORS[level], borderColor: LEVEL_BORDERS[level] };
}

export function SavingsHeatmap({ rows }: { rows: DailyStatsRow[] }) {
  const { cells, leading } = buildCells(rows);
  const totalSaved = rows.reduce((total, row) => total + row.estimatedTokensSaved, 0);

  return (
    <section className="mb-5 rounded-lg border border-[#dce3e8] bg-white p-[22px] shadow-[0_8px_24px_#26394d0d]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <h2 className="mb-1 text-[18px] font-semibold text-[#17202a]">Savings activity</h2>
          <p className="mb-3.5 text-[#66727f]">
            {formatInteger(totalSaved)} estimated tokens saved in the last year.
          </p>
        </div>
        <div
          className="mb-3.5 flex items-center gap-1 whitespace-nowrap text-[11px] text-[#66727f]"
          aria-label="Savings intensity"
        >
          <span>Less</span>
          {LEVEL_COLORS.map((_, level) => (
            <i key={level} className="block size-3 rounded-[2px] border" style={swatchStyle(level)} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 pt-0.5">
        <div
          className="grid shrink-0 grid-rows-7 gap-0.5 pt-px text-[10px] leading-3 text-[#66727f]"
          aria-hidden="true"
        >
          {WEEKDAYS.map((day, index) => (
            <span key={index}>{day}</span>
          ))}
        </div>
        <div
          className="grid min-w-[738px] flex-1 grid-flow-col grid-cols-[repeat(53,minmax(12px,1fr))] grid-rows-7 gap-0.5 [aspect-ratio:53/7]"
          role="img"
          aria-label="Daily estimated token savings over the last 365 days"
        >
          {Array.from({ length: leading }, (_, index) => (
            <span key={`lead-${index}`} className="invisible" aria-hidden="true" />
          ))}
          {cells.map((cell) => (
            <Tooltip
              key={cell.dateKey}
              size="sm"
              delay={150}
              closeDelay={0}
              content={`${cell.dateKey}: ${formatInteger(cell.saved)} estimated tokens saved`}
            >
              <span
                className="block size-full rounded-[2px] border"
                style={swatchStyle(cell.level)}
                aria-label={`${cell.dateKey}: ${formatInteger(cell.saved)} estimated tokens saved`}
              />
            </Tooltip>
          ))}
        </div>
      </div>
    </section>
  );
}
