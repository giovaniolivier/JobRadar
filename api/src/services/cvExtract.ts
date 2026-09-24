import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { HttpError } from "../middleware/errorHandler.js";

function extOf(name: string): string {
  const n = name.toLowerCase();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i) : "";
}

export function isCvBinaryUpload(filename: string, mimetype?: string): boolean {
  const ext = extOf(filename);
  const mime = (mimetype ?? "").toLowerCase();
  return (
    ext === ".pdf" ||
    ext === ".docx" ||
    mime === "application/pdf" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

/** Extrait le texte d’un CV (.txt / .md / .pdf / .docx). */
export async function extractCvText(
  buffer: Buffer,
  filename: string,
  mimetype?: string
): Promise<string> {
  const ext = extOf(filename);
  const mime = (mimetype ?? "").toLowerCase();

  if (ext === ".pdf" || mime === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = (result.text ?? "").replace(/\u0000/g, "").trim();
      if (!text || text.length < 40) {
        throw new HttpError(
          400,
          "Impossible d’extraire assez de texte de ce PDF. Exportez en .txt ou collez le contenu."
        );
      }
      return text;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, "PDF illisible. Essayez un autre fichier ou collez le texte.");
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  if (
    ext === ".docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value ?? "").replace(/\u0000/g, "").trim();
      if (!text || text.length < 40) {
        throw new HttpError(
          400,
          "Impossible d’extraire assez de texte de ce DOCX. Collez le contenu ou utilisez un .txt."
        );
      }
      return text;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, "DOCX illisible. Essayez un .txt ou collez le texte.");
    }
  }

  if (ext === ".doc") {
    throw new HttpError(
      400,
      "Le format .doc (Word ancien) n’est pas supporté. Enregistrez en .docx, .pdf ou .txt."
    );
  }

  const text = buffer.toString("utf8").replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
  if (!text) {
    throw new HttpError(400, "Fichier vide ou non texte.");
  }
  return text;
}
