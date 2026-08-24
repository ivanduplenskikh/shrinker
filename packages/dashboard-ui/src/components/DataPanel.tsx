import type { ReactNode } from "react";

export interface DataPanelRow {
  key: string;
  label: string;
  calls: string;
  value: string;
  note: string;
}

interface DataPanelProps {
  title: string;
  description: string;
  head: [string, string, string, string];
  rows: DataPanelRow[];
  empty: ReactNode;
}

export function DataPanel({ title, description, head, rows, empty }: DataPanelProps) {
  return (
    <section className="rounded-lg border border-[#dce3e8] bg-white p-[22px] shadow-[0_8px_24px_#26394d0d]">
      <h2 className="mb-1 text-[18px] font-semibold text-[#17202a]">{title}</h2>
      <p className="mb-3.5 text-[#66727f]">{description}</p>
      {rows.length === 0 ? (
        <p className="text-[#66727f]">{empty}</p>
      ) : (
        <div role="table" aria-label={title}>
          <div
            role="row"
            className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 border-b border-[#dce3e8] pb-[11px] text-[11px] font-bold uppercase tracking-[0.08em] text-[#66727f]"
          >
            {head.map((cell) => (
              <span key={cell} role="columnheader">
                {cell}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              role="row"
              className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 border-b border-[#dce3e8] py-[11px] last:border-b-0"
            >
              <span role="cell" className="truncate text-[#17202a]">
                {row.label}
              </span>
              <span role="cell" className="tabular-nums text-[#66727f]">
                {row.calls}
              </span>
              <strong role="cell" className="tabular-nums font-semibold text-[#17202a]">
                {row.value}
              </strong>
              <small role="cell" className="text-[#16856b]">
                {row.note}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
