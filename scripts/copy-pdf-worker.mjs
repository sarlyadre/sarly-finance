// Copies the pdf.js worker into /public so the Statements importer can load it
// at runtime (workerSrc = "/pdf.worker.min.mjs"). Runs on postinstall.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.mjs",
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
];

try {
  const src = candidates.map((c) => join(root, c)).find((p) => existsSync(p));
  if (!src) {
    console.warn("[copy-pdf-worker] worker not found — PDF import will be disabled.");
    process.exit(0);
  }
  const publicDir = join(root, "public");
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
  copyFileSync(src, join(publicDir, "pdf.worker.min.mjs"));
  console.log("[copy-pdf-worker] worker copied to public/pdf.worker.min.mjs");
} catch (err) {
  console.warn("[copy-pdf-worker] skipped:", err?.message ?? err);
}
