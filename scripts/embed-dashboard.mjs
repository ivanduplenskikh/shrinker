import { readdir, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE_PATH = "packages/dashboard-ui/dist";
const OUTPUT_PATH = "internal/dashboard/ui";

await mkdir("internal/dashboard/ui/assets", { recursive: true });
(await readdir(BASE_PATH)).forEach(async (file) => await copyFile(resolve(BASE_PATH, file), resolve(OUTPUT_PATH, file)));
