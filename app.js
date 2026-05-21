const APP_ID = "app_jnnlkgx7ehdy";
const API_BASE = "https://api.butterbase.ai/v1/app_jnnlkgx7ehdy";
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const BUILD_ID = "local-mock-ai-2026-05-21";
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const USE_MOCK_AI = true;

window.PDF_ANNOTATOR_BUILD_ID = BUILD_ID;
document.documentElement.dataset.build = BUILD_ID;

const state = {
  file: null,
  pdf: null,
  pages: [],
  annotations: [],
  scale: 1,
  objectId: null,
};

const els = {
  input: document.getElementById("pdfInput"),
  dropZone: document.getElementById("dropZone"),
  processButton: document.getElementById("processButton"),
  sampleButton: document.getElementById("sampleButton"),
  pages: document.getElementById("pages"),
  fileName: document.getElementById("fileName"),
  pageCount: document.getElementById("pageCount"),
  paragraphCount: document.getElementById("paragraphCount"),
  statusText: document.getElementById("statusText"),
  progressBar: document.getElementById("progressBar"),
  docTitle: document.getElementById("docTitle"),
  docSubtitle: document.getElementById("docSubtitle"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  zoomLabel: document.getElementById("zoomLabel"),
  popoverTemplate: document.getElementById("popoverTemplate"),
};

const sampleText = `The American Civil War was a conflict between the northern states, known as the Union, and the southern states, known as the Confederacy, which had seceded from the United States. The war began in 1861 after years of political, economic, and moral tensions surrounding slavery, states' rights, and the expansion of slavery into western territories. Southern states depended heavily on enslaved labor for their agricultural economy, especially cotton production, while many in the North opposed the spread of slavery. The election of Abraham Lincoln in 1860 intensified these tensions because southern leaders feared his administration would limit slavery. Major battles such as Gettysburg, Antietam, and Vicksburg caused enormous casualties and destruction. During the war, Lincoln issued the Emancipation Proclamation, which declared enslaved people in Confederate states to be free and shifted the war's purpose toward ending slavery. The Union eventually defeated the Confederacy in 1865 due to its stronger industry, transportation systems, and larger population. The Civil War resulted in the abolition of slavery through the Thirteenth Amendment and permanently strengthened the federal government's authority over the states.`;

async function loadPdfJs() {
  const pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_URL;
  return pdfjsLib;
}

function setStatus(text, progress) {
  els.statusText.textContent = text;
  if (typeof progress === "number") {
    els.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
}

function countSentences(text) {
  return (text.match(/[.!?]+(?=\s|$)/g) || []).length;
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[\ufb01]/g, "fi")
    .replace(/[\ufb02]/g, "fl")
    .replace(/[^\w\s]/g, " ");
}

function splitIntoSentences(text) {
  return normalizeText(text).match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
}

function getFontSize(item) {
  const [a, b] = item.transform;
  return Math.max(8, Math.hypot(a, b));
}

function transformMatrix(matrixA, matrixB) {
  return [
    matrixA[0] * matrixB[0] + matrixA[2] * matrixB[1],
    matrixA[1] * matrixB[0] + matrixA[3] * matrixB[1],
    matrixA[0] * matrixB[2] + matrixA[2] * matrixB[3],
    matrixA[1] * matrixB[2] + matrixA[3] * matrixB[3],
    matrixA[0] * matrixB[4] + matrixA[2] * matrixB[5] + matrixA[4],
    matrixA[1] * matrixB[4] + matrixA[3] * matrixB[5] + matrixA[5],
  ];
}

function lineKey(y) {
  return Math.round(y / 4) * 4;
}

function getFontFamily(fontName, textContent) {
  const family = textContent.styles?.[fontName]?.fontFamily || fontName || "";
  if (/courier|mono/i.test(family)) return "Courier New, monospace";
  if (/times|serif/i.test(family)) return "Times New Roman, Georgia, serif";
  return "Arial, Helvetica, sans-serif";
}

function getFontWeight(fontName) {
  return /bold|black|heavy|semibold|demi/i.test(fontName || "") ? 700 : 400;
}

function getFontStyle(fontName) {
  return /italic|oblique/i.test(fontName || "") ? "italic" : "normal";
}

function textBlocksOverlap(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const overlap = Math.max(0, right - left);
  return overlap / Math.max(1, Math.min(a.width, b.width));
}

function isSameTextColumn(current, line, medianFont) {
  if (!current) return false;
  const currentBox = { x: current.x, width: current.width };
  return Math.abs(line.x - current.x) < medianFont * 5 || textBlocksOverlap(currentBox, line) > 0.28;
}

function getCurrentBlockText(current) {
  return normalizeText(current.lines.map((line) => line.text).join(" "));
}

function classifyBlock(block, medianFont) {
  const text = block.text.trim();
  if (/^(\u2022|[-*]|[0-9]+[.)])\s+/.test(text)) return "bullet";
  if (block.fontSize >= medianFont * 1.35 && text.length < 120) return "title";
  if (block.fontSize >= medianFont * 1.12 && text.length < 140) return "header";
  if (countSentences(text) > 2 && text.length > 180) return "paragraph";
  return "text";
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 12;
  return sorted[Math.floor(sorted.length / 2)];
}

function extractBlocksFromTextContent(textContent, viewport, pageNumber) {
  const spans = textContent.items
    .map((item, index) => {
      const text = normalizeText(item.str || "");
      if (!text) return null;
      const textMatrix = transformMatrix(viewport.transform, item.transform);
      const x = textMatrix[4];
      const baselineY = textMatrix[5];
      const fontSize = Math.max(8, Math.hypot(textMatrix[2], textMatrix[3]) || getFontSize(item) * viewport.scale);
      const width = Math.max((item.width || 0) * viewport.scale, text.length * fontSize * 0.42, 8);
      return {
        id: `p${pageNumber}-s${index}`,
        text,
        x,
        y: baselineY - fontSize,
        baselineY,
        width,
        height: fontSize * 1.35,
        fontSize,
        fontFamily: getFontFamily(item.fontName, textContent),
        fontName: item.fontName || "",
        fontStyle: getFontStyle(item.fontName),
        fontWeight: getFontWeight(item.fontName),
        textLength: text.length,
      };
    })
    .filter(Boolean);

  const medianFont = median(spans.map((span) => span.fontSize));
  const lineMap = new Map();
  spans.forEach((span) => {
    const key = lineKey(span.y);
    if (!lineMap.has(key)) lineMap.set(key, []);
    lineMap.get(key).push(span);
  });

  const lines = [...lineMap.values()]
    .map((lineSpans, index) => {
      const ordered = lineSpans.sort((a, b) => a.x - b.x);
      const text = normalizeText(ordered.map((span) => span.text).join(" "));
      const x = Math.min(...ordered.map((span) => span.x));
      const y = Math.min(...ordered.map((span) => span.y));
      const right = Math.max(...ordered.map((span) => span.x + span.width));
      const bottom = Math.max(...ordered.map((span) => span.y + span.height));
      return {
        id: `p${pageNumber}-l${index}`,
        text,
        x,
        y,
        width: right - x,
        height: bottom - y,
        fontSize: median(ordered.map((span) => span.fontSize)),
        textLength: text.length,
        segments: ordered.map((span) => ({
          id: span.id,
          x: span.x,
          y: span.y,
          baselineY: span.baselineY,
          width: span.width,
          height: span.height,
          fontSize: span.fontSize,
          fontFamily: span.fontFamily,
          fontName: span.fontName,
          fontStyle: span.fontStyle,
          fontWeight: span.fontWeight,
          text: span.text,
          textLength: span.textLength,
        })),
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const blocks = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    current.text = normalizeText(current.lines.map((line) => line.text).join(" "));
    current.lineBoxes = current.lines.map((line) => ({
      x: line.x,
      y: line.y,
      baselineY: median(line.segments.map((segment) => segment.baselineY)),
      width: line.width,
      height: line.height,
      fontSize: line.fontSize,
      text: line.text,
      textLength: line.textLength,
      segments: line.segments,
    }));
    current.spanIds = current.lineBoxes.flatMap((line) => line.segments.map((segment) => segment.id));
    current.kind = classifyBlock(current, medianFont);
    delete current.lines;
    blocks.push(current);
    current = null;
  };

  lines.forEach((line) => {
    const lastLine = current?.lines[current.lines.length - 1];
    const gap = lastLine ? line.y - (lastLine.y + lastLine.height) : 999;
    const sameColumn = isSameTextColumn(current, line, medianFont);
    const lineKind = classifyBlock(line, medianFont);
    const currentKind = current ? classifyBlock({ ...current, text: getCurrentBlockText(current) }, medianFont) : null;
    const lineLooksStandalone = lineKind !== "text";
    const normalTextFlow = sameColumn && gap <= medianFont * 2.15;
    const continuationTextFlow = sameColumn && currentKind === "text" && lineKind === "text" && gap <= medianFont * 5.5;

    if (!current || lineLooksStandalone || (!normalTextFlow && !continuationTextFlow)) {
      flush();
      current = {
        id: `p${pageNumber}-b${blocks.length}`,
        pageNumber,
        lines: [line],
        x: line.x,
        y: line.y,
        width: line.width,
        height: line.height,
        fontSize: line.fontSize,
      };
      return;
    }

    current.lines.push(line);
    current.x = Math.min(current.x, line.x);
    current.y = Math.min(current.y, line.y);
    const right = Math.max(current.x + current.width, line.x + line.width);
    const bottom = Math.max(current.y + current.height, line.y + line.height);
    current.width = right - current.x;
    current.height = bottom - current.y;
    current.fontSize = median(current.lines.map((l) => l.fontSize));
  });
  flush();

  return {
    items: blocks.map((block) => ({
      ...block,
      x: Math.max(0, block.x - 2),
      y: Math.max(0, block.y - 2),
      width: Math.min(viewport.width - block.x, block.width + 6),
      height: block.height + 4,
      textLength: block.text.length,
    })),
    textSpans: spans,
  };
}

async function parsePdf(file) {
  const pdfjsLib = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  state.pdf = pdf;
  state.pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(`Reading page ${pageNumber} of ${pdf.numPages}...`, 8 + (pageNumber / pdf.numPages) * 34);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
    const textContent = await page.getTextContent();
    const pageText = extractBlocksFromTextContent(textContent, viewport, pageNumber);
    state.pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      items: pageText.items,
      textSpans: pageText.textSpans,
    });
  }
}

async function uploadPdf(file) {
  if (file.size < 1 || file.size > MAX_PDF_BYTES) {
    throw new Error("PDF must be between 1 byte and 10 MB.");
  }

  setStatus("Creating secure upload URL...", 46);
  const uploadResponse = await fetch(`${API_BASE}/fn/create-pdf-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/pdf",
      sizeBytes: file.size,
    }),
  });
  const uploadData = await uploadResponse.json();
  if (!uploadResponse.ok) throw new Error(uploadData.error || "Could not create upload URL");

  setStatus("Uploading original PDF to Butterbase storage...", 52);
  const putResponse = await fetch(uploadData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  if (!putResponse.ok) throw new Error("PDF upload failed");
  state.objectId = uploadData.objectId;
}

function getSummarizationPages() {
  return state.pages.map(({ pageNumber, width, height, items }) => ({
    pageNumber,
    width,
    height,
    items: items.map(({ lineBoxes, spanIds, textLength, ...item }) => ({
      ...item,
      textLength,
    })),
  }));
}

function makeMockChunk(label, sentences) {
  return {
    label,
    sourceText: normalizeText(sentences.filter(Boolean).join(" ")),
  };
}

function chunkBySentenceRanges(sentences, ranges) {
  return ranges
    .map(([label, start, end]) => makeMockChunk(label, sentences.slice(start, end)))
    .filter((chunk) => chunk.sourceText);
}

function findSentenceIndex(sentences, pattern) {
  const normalizedPattern = normalizeForMatch(pattern);
  return sentences.findIndex((sentence) => normalizeForMatch(sentence).includes(normalizedPattern));
}

function mockPlanForParagraph(text) {
  const sentences = splitIntoSentences(text);
  const normalized = normalizeForMatch(text);
  if (sentences.length < 2) return null;

  if (normalized.includes("bad final grade") && normalized.includes("mindful journaling") && normalized.includes("describe")) {
    return {
      header: "Mindfulness for Emotional Processing",
      chunks: chunkBySentenceRanges(sentences, [
        ["Emotional Impact of Bad Grades", 0, 2],
        ["Mindful Journaling Practice", 2, 4],
        ["Describing Emotions Objectively", 4, sentences.length],
      ]),
    };
  }

  if (normalized.includes("nonjudgmentally") && normalized.includes("one mindfully") && normalized.includes("journaling")) {
    const oneMindfully = findSentenceIndex(sentences, "One-Mindfully");
    const effectively = Math.max(
      findSentenceIndex(sentences, "Effectively"),
      findSentenceIndex(sentences, "effectively, I would tailor"),
    );
    const secondStart = oneMindfully > 0 ? oneMindfully : Math.ceil(sentences.length / 3);
    const thirdStart = effectively > secondStart ? effectively : Math.ceil((sentences.length * 2) / 3);
    return {
      header: "HOW Skills for Mindful Journaling",
      chunks: chunkBySentenceRanges(sentences, [
        ["Nonjudgmental Acceptance", 0, secondStart],
        ["One-Mindful Focus", secondStart, thirdStart],
        ["Effective Action Steps", thirdStart, sentences.length],
      ]),
    };
  }

  if (normalized.includes("recognize and validate my emotions") && normalized.includes("self discovery")) {
    const growthStart = findSentenceIndex(sentences, "So, Mindful Journaling");
    const splitAt = growthStart > 0 ? growthStart : Math.ceil(sentences.length / 2);
    return {
      header: "Benefits of Mindful Journaling",
      chunks: chunkBySentenceRanges(sentences, [
        ["Recognizing Emotional Patterns", 0, splitAt],
        ["Turning Challenge into Growth", splitAt, sentences.length],
      ]),
    };
  }

  return {
    header: null,
    chunks: [makeMockChunk("Mock Summary", sentences)],
  };
}

function annotationFromPlan(item, kind, label, originalText, index) {
  const lineHeight = Math.max(20, item.fontSize * 1.55);
  const x = kind === "bullet" ? item.x + Math.max(12, item.fontSize) : item.x;
  return {
    pageNumber: item.pageNumber,
    sourceItemIds: [item.id],
    kind,
    label,
    originalText,
    x,
    y: item.y + index * lineHeight,
    width: Math.max(24, item.width - (kind === "bullet" ? Math.max(12, item.fontSize) : 0)),
    height: lineHeight,
  };
}

function mockSummarizeDocument() {
  const annotations = [];
  let summarizedParagraphs = 0;

  state.pages.forEach((page) => {
    page.items.forEach((item) => {
      if (item.kind !== "paragraph" || countSentences(item.text) <= 2 || normalizeText(item.text).length <= 180) return;

      const plan = mockPlanForParagraph(item.text);
      if (!plan?.chunks?.length) return;

      let rowIndex = 0;
      if (plan.header) {
        annotations.push(annotationFromPlan(item, "header", plan.header, "", rowIndex));
        rowIndex += 1;
      }

      plan.chunks.forEach((chunk) => {
        annotations.push(annotationFromPlan(item, "bullet", chunk.label, chunk.sourceText, rowIndex));
        rowIndex += 1;
      });

      summarizedParagraphs += 1;
    });
  });

  return {
    document: {
      title: state.file?.name?.replace(/\.pdf$/i, "") || "Mock Annotated PDF",
      fileObjectId: null,
    },
    annotations,
    stats: {
      pages: state.pages.length,
      summarizedParagraphs,
      annotations: annotations.length,
    },
  };
}

async function summarizeDocument() {
  if (USE_MOCK_AI) {
    setStatus("Using local mock AI response...", 62);
    const data = mockSummarizeDocument();
    state.annotations = data.annotations || [];
    els.docTitle.textContent = data.document?.title || state.file.name;
    els.docSubtitle.textContent = `${data.stats?.summarizedParagraphs || 0} long paragraphs transformed with mock AI.`;
    return;
  }

  setStatus("Asking AI to create presentation annotations...", 62);
  const response = await fetch(`${API_BASE}/fn/summarize-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: state.file.name,
      title: state.file.name.replace(/\.pdf$/i, ""),
      fileObjectId: state.objectId,
      pages: getSummarizationPages(),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Summarization failed");
  state.annotations = data.annotations || [];
  els.docTitle.textContent = data.document?.title || state.file.name;
  els.docSubtitle.textContent = `${data.stats?.summarizedParagraphs || 0} long paragraphs transformed into clickable notes.`;
}

function getAnnotationsBySource(pageAnnotations) {
  const annotationsBySource = new Map();
  pageAnnotations.forEach((annotation) => {
    (annotation.sourceItemIds || []).forEach((sourceId) => {
      if (!annotationsBySource.has(sourceId)) annotationsBySource.set(sourceId, []);
      annotationsBySource.get(sourceId).push(annotation);
    });
  });
  return annotationsBySource;
}

function getSourceReplacements(pageData, pageAnnotations) {
  const annotationsBySource = getAnnotationsBySource(pageAnnotations);

  return pageData.items
    .filter((item) => item.kind === "paragraph" && annotationsBySource.has(item.id))
    .map((source) => ({
      source,
      annotations: annotationsBySource.get(source.id) || [],
    }));
}

function getSourceLines(source) {
  if (source.lineBoxes?.length) return source.lineBoxes;

  const lineHeight = Math.max(18, source.fontSize * 1.45);
  const lineCount = Math.max(1, Math.ceil(source.height / lineHeight));
  return Array.from({ length: lineCount }, (_, index) => ({
    x: source.x,
    y: source.y + index * lineHeight,
    baselineY: source.y + index * lineHeight + source.fontSize,
    width: source.width,
    height: lineHeight,
    fontSize: source.fontSize,
    text: index === 0 ? source.text : "",
    textLength: index === 0 ? source.text.length : 0,
  }));
}

function getSourceSpanIds(source) {
  if (source.spanIds?.length) return source.spanIds;
  return getSourceLines(source).flatMap((line) => (line.segments || []).map((segment) => segment.id)).filter(Boolean);
}

function getSkippedTextSpanIds(pageData, pageAnnotations) {
  const skipped = new Set();
  getSourceReplacements(pageData, pageAnnotations).forEach(({ source }) => {
    getSourceSpanIds(source).forEach((spanId) => skipped.add(spanId));
  });
  return skipped;
}

function setOriginalTextFont(ctx, span) {
  const fontStyle = span.fontStyle || "normal";
  const fontWeight = span.fontWeight || 400;
  const fontSize = Math.max(8, span.fontSize || 12);
  const fontFamily = span.fontFamily || "Arial, Helvetica, sans-serif";
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
}

function getTextSpanWidth(ctx, span) {
  setOriginalTextFont(ctx, span);
  const measuredWidth = ctx.measureText(span.text || "").width;
  const estimatedWidth = (span.textLength || (span.text || "").length) * Math.max(8, span.fontSize || 12) * 0.48;
  return Math.max(span.width || 0, measuredWidth, estimatedWidth, 4);
}

function shouldEraseRenderedSpan(ctx, x, y, width, height) {
  const sampleWidth = Math.max(1, Math.floor(width));
  const sampleHeight = Math.max(1, Math.floor(height));
  if (sampleWidth <= 0 || sampleHeight <= 0) return false;

  try {
    const pixels = ctx.getImageData(x, y, sampleWidth, sampleHeight).data;
    let nonWhitePixels = 0;
    const totalPixels = pixels.length / 4;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red < 245 || green < 245 || blue < 245) nonWhitePixels += 1;
    }

    return nonWhitePixels / Math.max(1, totalPixels) < 0.35;
  } catch (_) {
    return true;
  }
}

function eraseTextSpans(ctx, pageData, spanIds = null) {
  if (!pageData.textSpans?.length) return;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  pageData.textSpans.forEach((span) => {
    if (spanIds && !spanIds.has(span.id)) return;

    const fontSize = Math.max(8, span.fontSize || 12);
    const padX = Math.max(2, fontSize * 0.18);
    const padTop = Math.max(2, fontSize * 0.25);
    const padBottom = Math.max(3, fontSize * 0.32);
    const x = Math.max(0, span.x - padX);
    const y = Math.max(0, span.y - padTop);
    const right = Math.min(pageData.width, span.x + getTextSpanWidth(ctx, span) + padX);
    const bottom = Math.min(pageData.height, span.y + Math.max(span.height, fontSize * 1.35) + padBottom);
    if (!shouldEraseRenderedSpan(ctx, x, y, right - x, bottom - y)) return;
    ctx.fillRect(x, y, right - x, bottom - y);
  });
  ctx.restore();
}

function drawOriginalTextSpans(ctx, pageData, skippedSpanIds) {
  if (!pageData.textSpans?.length) return;

  ctx.save();
  ctx.fillStyle = "#1f2933";
  ctx.textBaseline = "alphabetic";
  pageData.textSpans
    .filter((span) => !skippedSpanIds.has(span.id))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((span) => {
      setOriginalTextFont(ctx, span);
      ctx.fillText(span.text, span.x, span.baselineY || span.y + Math.max(8, span.fontSize || 12), getTextSpanWidth(ctx, span));
    });
  ctx.restore();
}

function getCanvasLabel(annotation) {
  return annotation.kind === "bullet" ? `\u2022 ${annotation.label}` : annotation.label;
}

function getFixedLengthReplacement(annotation, sourceText) {
  const label = normalizeText(getCanvasLabel(annotation));
  const sourceLength = Math.max(label.length, sourceText?.length || 0);
  return label.padEnd(sourceLength, " ");
}

function getLineTextWidth(ctx, line) {
  const fontSize = Math.max(8, line.fontSize || 12);
  ctx.font = `${fontSize}px "Times New Roman", Georgia, serif`;
  const measuredWidth = ctx.measureText(line.text || "").width;
  const estimatedWidth = (line.textLength || (line.text || "").length) * fontSize * 0.48;
  return Math.max(line.width || 0, measuredWidth, estimatedWidth);
}

function eraseSourceText(ctx, source, pageData) {
  const lines = getSourceLines(source);
  const lineRights = lines.map((line) => line.x + getLineTextWidth(ctx, line));
  const paragraphRight = Math.min(pageData.width, Math.max(source.x + source.width, ...lineRights));

  ctx.save();
  ctx.fillStyle = "#ffffff";
  lines.forEach((line) => {
    const fontSize = Math.max(8, line.fontSize || source.fontSize || 12);
    const padLeft = Math.max(3, fontSize * 0.25);
    const padRight = Math.max(8, fontSize * 0.75);
    const padTop = Math.max(2, fontSize * 0.2);
    const padBottom = Math.max(4, fontSize * 0.35);
    const clearX = Math.max(0, line.x - padLeft);
    const clearY = Math.max(0, line.y - padTop);
    const lineRight = line.x + getLineTextWidth(ctx, line) + padRight;
    const clearRight = Math.min(pageData.width, Math.max(lineRight, paragraphRight + padRight));
    const clearBottom = Math.min(pageData.height, line.y + Math.max(line.height, fontSize * 1.35) + padBottom);
    ctx.fillRect(clearX, clearY, clearRight - clearX, clearBottom - clearY);
  });
  ctx.restore();
}

function layoutReplacementAnnotations(pageData, pageAnnotations) {
  const replacements = getSourceReplacements(pageData, pageAnnotations);
  const positioned = [];
  const replacedAnnotations = new Set();

  replacements.forEach(({ source, annotations }) => {
    const lines = getSourceLines(source);
    const orderedAnnotations = [...annotations].sort((a, b) => a.y - b.y || a.x - b.x);
    const lineHeight = median(lines.map((line) => line.height));
    const fontSize = Math.max(11, source.fontSize || median(lines.map((line) => line.fontSize)));

    orderedAnnotations.forEach((annotation, index) => {
      replacedAnnotations.add(annotation);
      const line = lines[index] || {
        x: source.x,
        y: source.y + index * lineHeight,
        width: source.width,
        height: lineHeight,
        fontSize,
        text: "",
        textLength: 0,
      };
      const indent = annotation.kind === "bullet" ? Math.max(10, fontSize * 0.9) : 0;
      const rightEdge = Math.min(pageData.width, source.x + source.width);
      const maxAvailableWidth = Math.max(24, pageData.width - (line.x + indent) - 8);
      const availableWidth = Math.min(
        maxAvailableWidth,
        Math.max(line.width - indent, rightEdge - (line.x + indent), source.width - indent, 220),
      );
      positioned.push({
        ...annotation,
        x: line.x + indent,
        y: line.y,
        width: Math.max(24, availableWidth),
        height: Math.max(18, line.height),
        fontSize: annotation.kind === "header" ? Math.max(14, fontSize * 1.08) : Math.max(12, fontSize * 0.96),
        replacementText: getFixedLengthReplacement(annotation, line.text || source.text),
      });
    });
  });

  pageAnnotations.forEach((annotation) => {
    if (!replacedAnnotations.has(annotation)) {
      positioned.push({
        ...annotation,
        fontSize: annotation.kind === "header" ? 15 : 13,
        replacementText: getFixedLengthReplacement(annotation, annotation.originalText || ""),
      });
    }
  });

  return positioned;
}

function drawReplacementText(ctx, annotation) {
  const label = (annotation.replacementText || getCanvasLabel(annotation)).trimEnd();
  let fontSize = annotation.fontSize || (annotation.kind === "header" ? 15 : 13);
  const weight = annotation.kind === "header" ? 800 : 650;
  const color = annotation.kind === "header" ? "#2563eb" : "#9f1239";

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${fontSize}px Inter, Arial, sans-serif`;
  while (fontSize > 9 && ctx.measureText(label).width > annotation.width) {
    fontSize -= 0.5;
    ctx.font = `${weight} ${fontSize}px Inter, Arial, sans-serif`;
  }
  const baseline = annotation.y + Math.min(Math.max(fontSize + 2, annotation.height * 0.78), annotation.height - 2);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, annotation.x, baseline);
  ctx.restore();
}

function drawReplacementTexts(ctx, annotations) {
  annotations.forEach((annotation) => drawReplacementText(ctx, annotation));
}

async function renderPdfPages() {
  const pdf = state.pdf;
  els.pages.innerHTML = "";
  for (let i = 1; i <= pdf.numPages; i += 1) {
    setStatus(`Rendering presentation page ${i} of ${pdf.numPages}...`, 82 + (i / pdf.numPages) * 14);
    const page = await pdf.getPage(i);
    const pageData = state.pages[i - 1];
    const viewport = page.getViewport({ scale: 1.35 });

    const pageEl = document.createElement("article");
    pageEl.className = "page";
    pageEl.style.width = `${viewport.width}px`;
    pageEl.style.height = `${viewport.height}px`;
    pageEl.style.transform = `scale(${state.scale})`;
    pageEl.style.marginBottom = `${(state.scale - 1) * viewport.height}px`;

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const canvasContext = canvas.getContext("2d");
    await page.render({ canvasContext, viewport }).promise;
    const pageAnnotations = state.annotations.filter((annotation) => annotation.pageNumber === i);
    const skippedSpanIds = getSkippedTextSpanIds(pageData, pageAnnotations);
    eraseTextSpans(canvasContext, pageData, skippedSpanIds);
    const positionedAnnotations = layoutReplacementAnnotations(pageData, pageAnnotations);
    drawReplacementTexts(canvasContext, positionedAnnotations);
    pageEl.appendChild(canvas);

    positionedAnnotations.forEach((annotation) => {
      const annotationButton = createAnnotation(annotation);
      if (annotationButton) pageEl.appendChild(annotationButton);
    });

    els.pages.appendChild(pageEl);
  }
  setStatus("Presentation ready.", 100);
}

function createAnnotation(annotation) {
  if (!annotation.originalText) return null;

  const button = document.createElement("button");
  button.className = `annotation ${annotation.kind}`;
  button.type = "button";
  button.setAttribute("aria-label", `Show original text for ${annotation.label}`);
  button.title = annotation.label;
  button.style.left = `${annotation.x}px`;
  button.style.top = `${annotation.y}px`;
  button.style.width = `${annotation.width}px`;
  button.style.height = `${Math.max(20, annotation.height)}px`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    showPopover(button, annotation.originalText);
  });
  return button;
}

function showPopover(anchor, text) {
  document.querySelectorAll(".source-popover").forEach((el) => el.remove());
  const popover = els.popoverTemplate.content.firstElementChild.cloneNode(true);
  popover.querySelector("p").textContent = text;
  popover.querySelector(".close-popover").addEventListener("click", () => popover.remove());
  anchor.parentElement.appendChild(popover);
  const left = Math.min(anchor.offsetLeft, anchor.parentElement.offsetWidth - 440);
  popover.style.left = `${Math.max(10, left)}px`;
  popover.style.top = `${anchor.offsetTop + anchor.offsetHeight + 8}px`;
}

function refreshCounters() {
  els.fileName.textContent = state.file?.name || "None";
  els.pageCount.textContent = String(state.pages.length);
  const paragraphs = state.pages.flatMap((page) => page.items).filter((item) => item.kind === "paragraph" && countSentences(item.text) > 2);
  els.paragraphCount.textContent = String(paragraphs.length);
}

async function handleFile(file) {
  if (!file || file.type !== "application/pdf") {
    setStatus("Choose a valid PDF file.", 0);
    return;
  }
  if (file.size < 1 || file.size > MAX_PDF_BYTES) {
    state.file = null;
    state.objectId = null;
    state.annotations = [];
    els.processButton.disabled = true;
    els.pages.innerHTML = "";
    els.fileName.textContent = file.name || "None";
    els.pageCount.textContent = "0";
    els.paragraphCount.textContent = "0";
    setStatus("PDF must be between 1 byte and 10 MB.", 0);
    return;
  }
  state.file = file;
  state.objectId = null;
  state.annotations = [];
  els.processButton.disabled = true;
  els.pages.innerHTML = "";
  setStatus("Loading PDF...", 5);
  try {
    await parsePdf(file);
    refreshCounters();
    els.processButton.disabled = false;
    setStatus("PDF ready. Transform it when you are ready.", 45);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not read PDF.", 0);
  }
}

async function processCurrentPdf() {
  if (!state.file || !state.pages.length) return;
  els.processButton.disabled = true;
  try {
    if (USE_MOCK_AI) {
      state.objectId = null;
    } else {
      await uploadPdf(state.file);
    }
    await summarizeDocument();
    await renderPdfPages();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Transform failed.", 0);
  } finally {
    els.processButton.disabled = false;
  }
}

async function autoloadLocalMockPdf() {
  if (!USE_MOCK_AI || !["127.0.0.1", "localhost"].includes(window.location.hostname)) return;

  const filename = new URLSearchParams(window.location.search).get("autoload");
  if (!filename) return;

  try {
    const params = new URLSearchParams(window.location.search);
    const response = await fetch(filename);
    if (!response.ok) throw new Error(`Could not load ${filename}`);
    const blob = await response.blob();
    const file = new File([blob], filename.split("/").pop() || "mock.pdf", { type: "application/pdf" });
    await handleFile(file);
    if (params.get("process") === "false") return;
    await processCurrentPdf();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not autoload mock PDF.", 0);
  }
}

function renderSample() {
  const width = 860;
  const height = 620;
  state.pdf = null;
  state.file = { name: "civil-war-sample.pdf" };
  state.pages = [{
    pageNumber: 1,
    width,
    height,
    items: [{
      id: "sample-paragraph",
      pageNumber: 1,
      kind: "paragraph",
      text: sampleText,
      x: 82,
      y: 142,
      width: 690,
      height: 270,
      fontSize: 15,
    }],
  }];
  state.annotations = [
    { pageNumber: 1, sourceItemIds: ["sample-paragraph"], kind: "header", label: "The American Civil War", originalText: "", x: 82, y: 142, width: 690, height: 24 },
    { pageNumber: 1, sourceItemIds: ["sample-paragraph"], kind: "bullet", label: "The Union vs The Confederacy", originalText: "The American Civil War was a conflict between the northern states, known as the Union, and the southern states, known as the Confederacy, which had seceded from the United States.", x: 98, y: 178, width: 650, height: 22 },
    { pageNumber: 1, sourceItemIds: ["sample-paragraph"], kind: "bullet", label: "Causes: Slavery, States' Rights", originalText: "The war began in 1861 after years of political, economic, and moral tensions surrounding slavery, states' rights, and the expansion of slavery into western territories. Southern states depended heavily on enslaved labor for their agricultural economy, especially cotton production, while many in the North opposed the spread of slavery. The election of Abraham Lincoln in 1860 intensified these tensions because southern leaders feared his administration would limit slavery.", x: 98, y: 210, width: 650, height: 22 },
    { pageNumber: 1, sourceItemIds: ["sample-paragraph"], kind: "bullet", label: "During the War", originalText: "Major battles such as Gettysburg, Antietam, and Vicksburg caused enormous casualties and destruction. During the war, Lincoln issued the Emancipation Proclamation, which declared enslaved people in Confederate states to be free and shifted the war's purpose toward ending slavery.", x: 98, y: 242, width: 650, height: 22 },
    { pageNumber: 1, sourceItemIds: ["sample-paragraph"], kind: "bullet", label: "Results", originalText: "The Union eventually defeated the Confederacy in 1865 due to its stronger industry, transportation systems, and larger population. The Civil War resulted in the abolition of slavery through the Thirteenth Amendment and permanently strengthened the federal government's authority over the states.", x: 98, y: 274, width: 650, height: 22 },
  ];
  els.docTitle.textContent = "Civil War Sample";
  els.docSubtitle.textContent = "Example transformation with clickable source windows.";
  refreshCounters();

  els.pages.innerHTML = "";
  const pageEl = document.createElement("article");
  pageEl.className = "page";
  pageEl.style.width = `${width}px`;
  pageEl.style.height = `${height}px`;
  pageEl.style.transform = `scale(${state.scale})`;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1f2933";
  ctx.font = "800 34px Arial";
  ctx.fillText("History Notes", 82, 92);
  ctx.font = "15px Arial";
  wrapCanvasText(ctx, sampleText, 82, 150, 690, 22);
  const sourceReplacements = getSourceReplacements(state.pages[0], state.annotations);
  sourceReplacements.forEach(({ source }) => eraseSourceText(ctx, source, state.pages[0]));
  const positionedAnnotations = layoutReplacementAnnotations(state.pages[0], state.annotations);
  drawReplacementTexts(ctx, positionedAnnotations);
  pageEl.appendChild(canvas);
  positionedAnnotations.forEach((annotation) => {
    const annotationButton = createAnnotation(annotation);
    if (annotationButton) pageEl.appendChild(annotationButton);
  });
  els.pages.appendChild(pageEl);
  setStatus("Sample ready.", 100);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  words.forEach((word) => {
    const test = `${line}${word} `;
    if (ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, y);
      line = `${word} `;
      y += lineHeight;
    } else {
      line = test;
    }
  });
  ctx.fillText(line, x, y);
}

function setZoom(nextScale) {
  state.scale = Math.max(0.55, Math.min(1.45, nextScale));
  els.zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
  document.querySelectorAll(".page").forEach((page) => {
    page.style.transform = `scale(${state.scale})`;
  });
}

els.input.addEventListener("change", (event) => handleFile(event.target.files[0]));
els.processButton.addEventListener("click", processCurrentPdf);
els.sampleButton.addEventListener("click", renderSample);
els.zoomIn.addEventListener("click", () => setZoom(state.scale + 0.1));
els.zoomOut.addEventListener("click", () => setZoom(state.scale - 0.1));
document.addEventListener("click", () => document.querySelectorAll(".source-popover").forEach((el) => el.remove()));

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragover");
  });
});

els.dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
autoloadLocalMockPdf();
