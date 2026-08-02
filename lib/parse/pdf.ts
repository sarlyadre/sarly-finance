// Client-side PDF text extraction using pdf.js. Loaded dynamically so it never
// runs on the server. Returns statement text (one line per visual row) which is
// then fed to the heuristic parser in statement.ts.
// Thrown when a PDF is encrypted; the UI catches this to prompt for a password.
export class PdfPasswordError extends Error {
  code = "PDF_PASSWORD" as const;
  constructor(public reason: "need" | "wrong") {
    super(reason === "wrong" ? "Incorrect password." : "Password required.");
    this.name = "PdfPasswordError";
  }
}

export async function extractPdfText(
  file: File,
  password?: string
): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  // Worker is copied to /public by scripts/copy-pdf-worker.mjs on install.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false, password })
      .promise;
  } catch (e: any) {
    if (e?.name === "PasswordException") {
      // code 1 = needs a password, code 2 = the password was wrong
      throw new PdfPasswordError(e.code === 2 ? "wrong" : "need");
    }
    throw e;
  }

  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as { str: string; transform: number[] }[];

    // Group text fragments into visual lines by their y coordinate.
    const lines = new Map<number, { x: number; str: string }[]>();
    for (const it of items) {
      if (!it.str) continue;
      const yBucket = Math.round(it.transform[5] / 3) * 3;
      if (!lines.has(yBucket)) lines.set(yBucket, []);
      lines.get(yBucket)!.push({ x: it.transform[4], str: it.str });
    }
    const ys = Array.from(lines.keys()).sort((a, b) => b - a); // top to bottom
    for (const y of ys) {
      const line = lines
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((f) => f.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) out += line + "\n";
    }
    out += "\n";
  }
  return out;
}
