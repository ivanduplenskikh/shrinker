import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyFilter } from "../src/filters/select-filter.js";
import type { FilterKind } from "../src/filters/types.js";
import { formatMeasurements, measure } from "../src/metrics/measure.js";

const fixtureDirectory = path.join(process.cwd(), "tests", "fixtures");
const examples: Array<{ title: string; file: string; kind: FilterKind; command: string[] }> = [
  { title: "Git status", file: "git-status.txt", kind: "git-status", command: ["git", "status"] },
  { title: "Git diff", file: "git-diff.txt", kind: "git-diff", command: ["git", "diff"] },
  { title: "Test failure", file: "test-output.txt", kind: "test", command: ["npm", "test"] },
  { title: "Noisy log", file: "generic-log.txt", kind: "log", command: [] },
];

for (const example of examples) {
  const raw = await readFile(path.join(fixtureDirectory, example.file), "utf8");
  const result = applyFilter(raw, example.kind, example.command, {
    maxLines: 80,
    perFileLines: 20,
  });

  console.log(`\n=== ${example.title} ===`);
  console.log(result.output);
  console.log(formatMeasurements(measure(raw, result.output)));
}
