const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "Content-Disposition, X-Document-Filename, X-Document-Id, X-Document-Size",
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCX_BYTES = 10 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function validationError(error, code) {
  return json({ error, code, skipped: true });
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractGoogleDocId(value) {
  const raw = normalizeText(value);
  if (/^[A-Za-z0-9_-]{20,}$/.test(raw)) return raw;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }

  if (!/(^|\.)docs\.google\.com$/i.test(parsed.hostname) && !/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) {
    return "";
  }

  const documentMatch = parsed.pathname.match(/\/document\/d\/([A-Za-z0-9_-]+)/);
  if (documentMatch) return documentMatch[1];

  const fileMatch = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  const openId = parsed.searchParams.get("id");
  if (openId && /^[A-Za-z0-9_-]{20,}$/.test(openId)) return openId;

  return "";
}

function sanitizeFilename(filename) {
  const cleaned = normalizeText(filename)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  const fallback = "google-doc.docx";
  const base = cleaned || fallback;
  return /\.docx$/i.test(base) ? base : `${base}.docx`;
}

function filenameFromDisposition(header, documentId) {
  const fallback = `google-doc-${documentId.slice(0, 8)}.docx`;
  if (!header) return fallback;

  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return sanitizeFilename(encodedMatch[1]);
    }
  }

  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch) return quotedMatch[1];

  const plainMatch = header.match(/filename=([^;]+)/i);
  if (plainMatch) return plainMatch[1];

  return fallback;
}

async function readRequestBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function inaccessibleError() {
  return validationError(
    "Could not import this Google Doc. Make sure it is shared with anyone who has the link, or upload an exported DOCX file.",
    "GOOGLE_DOC_NOT_ACCESSIBLE",
  );
}

export async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await readRequestBody(request);
  const documentId = extractGoogleDocId(body.url || body.documentId || body.id);
  if (!documentId) {
    return validationError("Paste a valid Google Docs link.", "INVALID_GOOGLE_DOC_URL");
  }

  const exportUrl = `https://docs.google.com/document/d/${documentId}/export?format=docx`;
  const response = await fetch(exportUrl, {
    headers: {
      "Accept": DOCX_MIME,
    },
    redirect: "follow",
  });

  if (!response.ok) return inaccessibleError();

  const contentType = response.headers.get("Content-Type") || "";
  if (/text\/html|application\/json/i.test(contentType)) return inaccessibleError();

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > MAX_DOCX_BYTES) {
    return validationError("Google Doc export must be between 1 byte and 10 MB.", "GOOGLE_DOC_SIZE_LIMIT");
  }

  const filename = sanitizeFilename(filenameFromDisposition(response.headers.get("Content-Disposition"), documentId));
  return new Response(buffer, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "X-Document-Filename": encodeURIComponent(filename),
      "X-Document-Id": documentId,
      "X-Document-Size": String(buffer.byteLength),
    },
  });
}
