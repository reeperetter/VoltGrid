import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "web", "dist");
const dst = join(here, "..", "dist-web");

if (!existsSync(join(src, "index.html"))) {
  console.error("Немає apps/web/dist — спочатку виконайте: pnpm --filter @voltgrid/web build");
  process.exit(1);
}
rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });
console.log("Веб-збірку скопійовано в apps/desktop/dist-web");
