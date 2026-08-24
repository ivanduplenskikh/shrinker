import { Input } from "@heroui/react";

interface CostRateInputProps {
  value: number;
  onChange: (next: number) => void;
}

export function CostRateInput({ value, onChange }: CostRateInputProps) {
  return (
    <div className="grid min-w-[218px] gap-1">
      <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#66727f]">
        Input price
      </span>
      <Input
        aria-label="Input price per million tokens"
        type="number"
        size="sm"
        radius="sm"
        variant="bordered"
        min={0}
        step={0.01}
        inputMode="decimal"
        value={String(value)}
        onValueChange={(next) => onChange(Number(next))}
        startContent={<span className="text-[#66727f]">$</span>}
        endContent={<span className="whitespace-nowrap text-[#66727f]">/ 1M tokens</span>}
        classNames={{ inputWrapper: "bg-white border-[#dce3e8]" }}
      />
    </div>
  );
}
