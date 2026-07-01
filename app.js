const APP_ID = "app_jnnlkgx7ehdy";
const API_BASE = "https://api.butterbase.ai/v1/app_jnnlkgx7ehdy";
const AUTH_BASE = `https://api.butterbase.ai/auth/${APP_ID}`;
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const TESSERACT_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const MAMMOTH_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/mammoth@1.9.1/mammoth.browser.min.js";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MODEL = "openai/gpt-4.1-mini";
const OCR_MAX_SCANNED_PAGES = 5;
const OCR_RENDER_SCALE = 2.4;
const OCR_DESKEW_MAX_ANGLE = 8;
const OCR_DESKEW_COARSE_STEP = 0.5;
const OCR_DESKEW_FINE_STEP = 0.1;
const OCR_DESKEW_MIN_APPLY_ANGLE = 0.3;
const OCR_DESKEW_MIN_CONFIDENCE = 0.015;
const OCR_DESKEW_SAMPLE_WIDTH = 640;
const SCANNED_SELECTABLE_WORD_LIMIT = 18;
const SCANNED_SOURCE_BLOCK_LIMIT = 0;

const FALLBACK_MODELS = [
  { id: "openai/gpt-4.1-mini", name: "Balanced - GPT-4.1 Mini", prompt_price_per_mtok: 0.48, completion_price_per_mtok: 1.92 },
  { id: "google/gemini-3.1-flash-lite", name: "Long Document - Gemini 3.1 Flash Lite", prompt_price_per_mtok: 0.3, completion_price_per_mtok: 1.8 },
  { id: "anthropic/claude-sonnet-4.6", name: "High Quality - Claude Sonnet 4.6", prompt_price_per_mtok: 3.6, completion_price_per_mtok: 18 },
  { id: "anthropic/claude-opus-4.7", name: "Premium - Claude Opus 4.7", prompt_price_per_mtok: 6, completion_price_per_mtok: 30 },
];

const MIN_TEXT_CONTRAST = 4.5;
const HEADER_COLOR_PALETTE = ["#2563eb", "#1d4ed8", "#1e40af", "#60a5fa", "#93c5fd", "#bfdbfe", "#172554", "#eff6ff"];
const BULLET_COLOR_PALETTE = ["#9f1239", "#dc2626", "#b91c1c", "#f43f5e", "#fb7185", "#fca5a5", "#7f1d1d", "#fff1f2"];
const DEBUG_SOURCE_REGION_OVERLAY = false;
const DEBUG_SOURCE_SEGMENT_RECTS = false;
const DEBUG_VISUAL_SAMPLING_BANDS = false;
const DEBUG_VISUAL_SPAN_SAMPLE_BOXES = false;

const FONT_OPTIONS = {
  lexend: {
    label: "Lexend",
    css: "Lexend, Verdana, Arial, sans-serif",
    canvas: "Lexend, Verdana, Arial, sans-serif",
  },
  verdana: {
    label: "Verdana",
    css: "Verdana, Geneva, sans-serif",
    canvas: "Verdana, Geneva, sans-serif",
  },
  "comic-sans": {
    label: "Comic Sans",
    css: '"Comic Sans MS", "Comic Sans", cursive',
    canvas: '"Comic Sans MS", "Comic Sans", cursive',
  },
  calibri: {
    label: "Calibri",
    css: "Calibri, Candara, Segoe, sans-serif",
    canvas: "Calibri, Candara, Segoe, sans-serif",
  },
  arial: {
    label: "Arial",
    css: "Arial, Helvetica, sans-serif",
    canvas: "Arial, Helvetica, sans-serif",
  },
  opendyslexic: {
    label: "OpenDyslexic",
    css: "OpenDyslexic, Verdana, Arial, sans-serif",
    canvas: "OpenDyslexic, Verdana, Arial, sans-serif",
  },
};

const DEFAULT_READING_SETTINGS = {
  font: "lexend",
  textSize: 100,
  lineDistance: 145,
};

const COLOR_OPTIONS = {
  blue: "#007AFF",
  teal: "#5AC8FA",
  purple: "#AF52DE",
  black: "#000000",
  white: "#FFFFFF",
  green: "#34C759",
  rose: "#FF375F",
  red: "#FF3B30",
  orange: "#FF9500",
  yellow: "#FFCC00",
  gray: "#8E8E93",
  brown: "#8E6E53",
  indigo: "#5856D6",
  mint: "#00C7BE",
};

const COLOR_PRESETS = [
  "#000000", "#FFFFFF", "#E4573D", "#D63B6A", "#8E3AB9",
  "#6544C4", "#4A5BBE", "#007AFF", "#55ACEE", "#5DB8CE",
  "#4D9C90", "#6EAF5A", "#9BC451", "#D4DF3F", "#FFE94A",
  "#FFCC00", "#F6A21A", "#F2692E", "#7A5C4B", "#A3A3A3",
  "#708696",
];

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getStoredNumber(key, fallback, min, max) {
  const value = Number(localStorage.getItem(key));
  if (!Number.isFinite(value)) return fallback;
  return clampValue(value, min, max);
}

const state = {
  file: null,
  fileKind: "",
  pdf: null,
  pages: [],
  annotations: [],
  summaryData: null,
  scale: 1,
  objectId: null,
  models: [],
  selectedModel: DEFAULT_MODEL,
  fileSource: "",
  extractionMode: "text",
  ocrApplied: false,
  ocrUnavailableReason: "",
  ocrSkippedByUser: false,
  selectedFont: localStorage.getItem("documentAnnotatorFont") || DEFAULT_READING_SETTINGS.font,
  textSize: getStoredNumber("documentAnnotatorTextSize", DEFAULT_READING_SETTINGS.textSize, 50, 200),
  lineDistance: getStoredNumber("documentAnnotatorLineDistance", DEFAULT_READING_SETTINGS.lineDistance, 100, 300),
  headerColor: localStorage.getItem("documentAnnotatorHeaderColor") || COLOR_OPTIONS.blue,
  bulletColor: localStorage.getItem("documentAnnotatorBulletColor") || COLOR_OPTIONS.rose,
  popoverSettings: {},
  customizingPopoverKey: "",
  settingsRenderTimer: null,
  authMode: "login",
  auth: {
    accessToken: localStorage.getItem("documentAnnotatorAccessToken") || "",
    refreshToken: localStorage.getItem("documentAnnotatorRefreshToken") || "",
    user: null,
    subscription: null,
  },
};

const els = {
  operationPage: document.getElementById("operationPage"),
  authPage: document.getElementById("authPage"),
  accountPage: document.getElementById("accountPage"),
  operationNavButton: document.getElementById("operationNavButton"),
  accountNavButton: document.getElementById("accountNavButton"),
  loginNavButton: document.getElementById("loginNavButton"),
  signupNavButton: document.getElementById("signupNavButton"),
  input: document.getElementById("pdfInput"),
  dropZone: document.getElementById("dropZone"),
  googleDocForm: document.getElementById("googleDocForm"),
  googleDocUrl: document.getElementById("googleDocUrl"),
  googleDocButton: document.getElementById("googleDocButton"),
  processButton: document.getElementById("processButton"),
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
  modelSelect: document.getElementById("modelSelect"),
  headerColorGrid: document.getElementById("headerColorGrid"),
  bulletColorGrid: document.getElementById("bulletColorGrid"),
  headerColorTrigger: document.getElementById("headerColorTrigger"),
  bulletColorTrigger: document.getElementById("bulletColorTrigger"),
  headerColorDropdown: document.getElementById("headerColorDropdown"),
  bulletColorDropdown: document.getElementById("bulletColorDropdown"),
  headerColorInput: document.getElementById("headerColorInput"),
  bulletColorInput: document.getElementById("bulletColorInput"),
  headerHexInput: document.getElementById("headerHexInput"),
  bulletHexInput: document.getElementById("bulletHexInput"),
  loginTab: document.getElementById("loginTab"),
  signupTab: document.getElementById("signupTab"),
  authPageTitle: document.getElementById("authPageTitle"),
  authForm: document.getElementById("authForm"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authName: document.getElementById("authName"),
  authSubmit: document.getElementById("authSubmit"),
  verifyForm: document.getElementById("verifyForm"),
  verifyEmail: document.getElementById("verifyEmail"),
  verifyCode: document.getElementById("verifyCode"),
  accountPageSubtitle: document.getElementById("accountPageSubtitle"),
  accountSession: document.getElementById("accountSession"),
  accountEmail: document.getElementById("accountEmail"),
  accountStatus: document.getElementById("accountStatus"),
  membershipButton: document.getElementById("membershipButton"),
  authStatus: document.getElementById("authStatus"),
  readingSettingsPanel: document.getElementById("readingSettingsPanel"),
  settingsModeLabel: document.getElementById("settingsModeLabel"),
  fontSelect: document.getElementById("fontSelect"),
  textSizeRange: document.getElementById("textSizeRange"),
  textSizeValue: document.getElementById("textSizeValue"),
  lineDistanceRange: document.getElementById("lineDistanceRange"),
  lineDistanceValue: document.getElementById("lineDistanceValue"),
  settingsDoneButton: document.getElementById("settingsDoneButton"),
  scannedPdfModal: document.getElementById("scannedPdfModal"),
  scannedPdfConfirm: document.getElementById("scannedPdfConfirm"),
  scannedPdfCancel: document.getElementById("scannedPdfCancel"),
};

const sampleText = `The American Civil War was a conflict between the northern states, known as the Union, and the southern states, known as the Confederacy, which had seceded from the United States. The war began in 1861 after years of political, economic, and moral tensions surrounding slavery, states' rights, and the expansion of slavery into western territories. Southern states depended heavily on enslaved labor for their agricultural economy, especially cotton production, while many in the North opposed the spread of slavery. The election of Abraham Lincoln in 1860 intensified these tensions because southern leaders feared his administration would limit slavery. Major battles such as Gettysburg, Antietam, and Vicksburg caused enormous casualties and destruction. During the war, Lincoln issued the Emancipation Proclamation, which declared enslaved people in Confederate states to be free and shifted the war's purpose toward ending slavery. The Union eventually defeated the Confederacy in 1865 due to its stronger industry, transportation systems, and larger population. The Civil War resulted in the abolition of slavery through the Thirteenth Amendment and permanently strengthened the federal government's authority over the states.`;

async function loadPdfJs() {
  const pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_URL;
  return pdfjsLib;
}

let tesseractLoadPromise = null;
let mammothLoadPromise = null;

function getSelectedFontOption() {
  return FONT_OPTIONS[state.selectedFont] || FONT_OPTIONS.lexend;
}

function getFontOption(font = state.selectedFont) {
  return FONT_OPTIONS[font] || FONT_OPTIONS.lexend;
}

function getCanvasFontFamily() {
  return getSelectedFontOption().canvas;
}

function getCanvasFont(weight, fontSize) {
  return `${weight} ${fontSize}px ${getCanvasFontFamily()}`;
}

function getReadingFontScale(settings = state) {
  return clampValue(Number(settings.textSize) || DEFAULT_READING_SETTINGS.textSize, 50, 200) / 100;
}

function getReadingLineHeight(settings = state) {
  return clampValue(Number(settings.lineDistance) || DEFAULT_READING_SETTINGS.lineDistance, 100, 300) / 100;
}

function normalizeHexColor(value, fallback = "#000000") {
  const raw = String(value || "").trim();
  const expanded = raw.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, "#$1$1$2$2$3$3");
  const withHash = expanded.startsWith("#") ? expanded : `#${expanded}`;
  return /^#[a-f\d]{6}$/i.test(withHash) ? withHash.toUpperCase() : fallback;
}

function getColorValue(colorValue, fallbackValue) {
  return normalizeHexColor(colorValue, normalizeHexColor(fallbackValue, "#000000"));
}

function getGlobalReadingSettings() {
  return {
    font: FONT_OPTIONS[state.selectedFont] ? state.selectedFont : DEFAULT_READING_SETTINGS.font,
    textSize: state.textSize,
    lineDistance: state.lineDistance,
  };
}

function getPopoverSettings(key) {
  return state.popoverSettings[key] || null;
}

function getActiveControlSettings() {
  if (state.customizingPopoverKey) {
    return getPopoverSettings(state.customizingPopoverKey) || getGlobalReadingSettings();
  }
  return getGlobalReadingSettings();
}

async function loadSelectedFont() {
  if (!document.fonts) return;
  const family = getCanvasFontFamily();
  await Promise.allSettled([
    document.fonts.load(`400 16px ${family}`),
    document.fonts.load(`700 16px ${family}`),
    document.fonts.load(`800 16px ${family}`),
  ]);
}

function syncSettingsControls() {
  const settings = getActiveControlSettings();
  if (els.fontSelect) els.fontSelect.value = settings.font;
  if (els.textSizeRange) els.textSizeRange.value = String(settings.textSize);
  if (els.textSizeValue) els.textSizeValue.textContent = `${settings.textSize}%`;
  if (els.lineDistanceRange) els.lineDistanceRange.value = String(settings.lineDistance);
  if (els.lineDistanceValue) els.lineDistanceValue.textContent = (settings.lineDistance / 100).toFixed(2);
}

function applyReadingSettings() {
  const option = getSelectedFontOption();
  document.documentElement.style.setProperty("--app-font", option.css);
  document.documentElement.style.setProperty("--reading-font-scale", String(getReadingFontScale()));
  document.documentElement.style.setProperty("--reading-line-height", String(getReadingLineHeight()));
  document.documentElement.style.setProperty("--header-color", getColorValue(state.headerColor, COLOR_OPTIONS.blue));
  document.documentElement.style.setProperty("--bullet-color", getColorValue(state.bulletColor, COLOR_OPTIONS.rose));
  syncColorControls();
  syncSettingsControls();
}

async function rerenderCurrentOutput() {
  if (!state.annotations.length) return;
  await loadSelectedFont();
  if (state.fileKind === "docx") {
    renderDocumentView();
    return;
  }
  if (state.fileKind === "pdf" && state.pdf) {
    await renderPdfPages();
    return;
  }
  if (state.fileKind === "sample") {
    await renderSample();
  }
}

function scheduleOutputRerender() {
  if (state.settingsRenderTimer) window.clearTimeout(state.settingsRenderTimer);
  state.settingsRenderTimer = window.setTimeout(() => {
    state.settingsRenderTimer = null;
    rerenderCurrentOutput().catch((error) => {
      console.error(error);
      setStatus("Settings changed, but the preview could not be redrawn.", 0);
    });
  }, 140);
}

async function updateGlobalReadingSettings(partial, rerenderImmediately = false) {
  if (partial.font && FONT_OPTIONS[partial.font]) {
    state.selectedFont = partial.font;
    localStorage.setItem("documentAnnotatorFont", partial.font);
  }
  if (partial.textSize !== undefined) {
    state.textSize = clampValue(Number(partial.textSize) || DEFAULT_READING_SETTINGS.textSize, 50, 200);
    localStorage.setItem("documentAnnotatorTextSize", String(state.textSize));
  }
  if (partial.lineDistance !== undefined) {
    state.lineDistance = clampValue(Number(partial.lineDistance) || DEFAULT_READING_SETTINGS.lineDistance, 100, 300);
    localStorage.setItem("documentAnnotatorLineDistance", String(state.lineDistance));
  }

  applyReadingSettings();
  await loadSelectedFont();
  if (rerenderImmediately) {
    await rerenderCurrentOutput();
  } else {
    scheduleOutputRerender();
  }
}

async function updateAnnotationColors(partial) {
  if (partial.headerColor) {
    state.headerColor = normalizeHexColor(partial.headerColor, COLOR_OPTIONS.blue);
    localStorage.setItem("documentAnnotatorHeaderColor", state.headerColor);
  }
  if (partial.bulletColor) {
    state.bulletColor = normalizeHexColor(partial.bulletColor, COLOR_OPTIONS.rose);
    localStorage.setItem("documentAnnotatorBulletColor", state.bulletColor);
  }
  applyReadingSettings();
  await rerenderCurrentOutput();
}

function syncColorControls() {
  const headerColor = getColorValue(state.headerColor, COLOR_OPTIONS.blue);
  const bulletColor = getColorValue(state.bulletColor, COLOR_OPTIONS.rose);
  if (els.headerColorInput) els.headerColorInput.value = headerColor;
  if (els.bulletColorInput) els.bulletColorInput.value = bulletColor;
  if (els.headerHexInput) els.headerHexInput.value = headerColor;
  if (els.bulletHexInput) els.bulletHexInput.value = bulletColor;
  document.querySelectorAll(".color-swatch").forEach((button) => {
    const target = button.dataset.colorTarget;
    const activeColor = target === "header" ? headerColor : bulletColor;
    button.classList.toggle("active", button.dataset.color === activeColor);
  });
}

function closeColorDropdowns(except = null) {
  [
    [els.headerColorDropdown, els.headerColorTrigger],
    [els.bulletColorDropdown, els.bulletColorTrigger],
  ].forEach(([dropdown, trigger]) => {
    if (!dropdown || dropdown === except) return;
    dropdown.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
  });
}

function toggleColorDropdown(target) {
  const dropdown = target === "header" ? els.headerColorDropdown : els.bulletColorDropdown;
  const trigger = target === "header" ? els.headerColorTrigger : els.bulletColorTrigger;
  if (!dropdown || !trigger) return;
  const shouldOpen = dropdown.hidden;
  closeColorDropdowns(shouldOpen ? dropdown : null);
  dropdown.hidden = !shouldOpen;
  trigger.setAttribute("aria-expanded", String(shouldOpen));
}

function renderColorGrid(container, target) {
  if (!container) return;
  container.innerHTML = "";
  COLOR_PRESETS.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-swatch";
    button.dataset.colorTarget = target;
    button.dataset.color = color;
    button.style.background = color;
    button.setAttribute("aria-label", `${target} color ${color}`);
    button.addEventListener("click", () => {
      updateAnnotationColors(target === "header" ? { headerColor: color } : { bulletColor: color }).catch((error) => {
        console.error(error);
        setStatus("Color changed, but the preview could not be redrawn.", 0);
      });
      closeColorDropdowns();
    });
    container.appendChild(button);
  });
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === src);
    if (existing && existing.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing || document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load OCR engine.")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

async function loadTesseract() {
  if (!tesseractLoadPromise) {
    tesseractLoadPromise = loadExternalScript(TESSERACT_SCRIPT_URL).then(() => {
      if (!window.Tesseract?.createWorker) throw new Error("OCR engine did not initialize.");
      return window.Tesseract;
    });
  }
  return tesseractLoadPromise;
}

async function loadMammoth() {
  if (!mammothLoadPromise) {
    mammothLoadPromise = loadExternalScript(MAMMOTH_SCRIPT_URL).then(() => {
      if (!window.mammoth?.convertToHtml) throw new Error("Word document reader did not initialize.");
      return window.mammoth;
    });
  }
  return mammothLoadPromise;
}

function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
}

function isDocxFile(file) {
  return file?.type === DOCX_MIME
    || /\.docx$/i.test(file?.name || "");
}

function getDocumentTitle(file = state.file) {
  return file?.name?.replace(/\.(pdf|docx)$/i, "") || "Uploaded document";
}

function setStatus(text, progress) {
  els.statusText.textContent = text;
  if (typeof progress === "number") {
    els.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
}

function setGoogleDocImportDisabled(disabled) {
  if (els.googleDocButton) els.googleDocButton.disabled = disabled;
  if (els.googleDocUrl) els.googleDocUrl.disabled = disabled;
}

function normalizeDocxFilename(filename, fallback = "google-doc.docx") {
  const cleaned = String(filename || fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const base = cleaned || fallback;
  return /\.docx$/i.test(base) ? base : `${base}.docx`;
}

async function importGoogleDocFromUrl(url) {
  const response = await fetch(`${API_BASE}/fn/import-google-doc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Could not import Google Doc.");
  }
  if (!response.ok) throw new Error("Could not import Google Doc.");

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new Error("Google Doc import returned no document data.");
  const encodedFilename = response.headers.get("X-Document-Filename") || "";
  const filename = encodedFilename ? decodeURIComponent(encodedFilename) : "google-doc.docx";
  return new File([buffer], normalizeDocxFilename(filename), {
    type: contentType || DOCX_MIME,
  });
}

async function handleGoogleDocImport(event) {
  event.preventDefault();
  const url = els.googleDocUrl?.value?.trim() || "";
  if (!url) {
    setStatus("Paste a Google Docs link to import.", 0);
    return;
  }
  setGoogleDocImportDisabled(true);
  els.processButton.disabled = true;
  setStatus("Importing Google Doc...", 4);
  try {
    const file = await importGoogleDocFromUrl(url);
    await handleFile(file, { source: "google-doc" });
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not import Google Doc.", 0);
  } finally {
    setGoogleDocImportDisabled(false);
  }
}

function confirmScannedPdf() {
  return new Promise((resolve) => {
    const modal = els.scannedPdfModal;
    const confirmButton = els.scannedPdfConfirm;
    const cancelButton = els.scannedPdfCancel;
    if (!modal || !confirmButton || !cancelButton) {
      resolve(true);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      modal.hidden = true;
      confirmButton.removeEventListener("click", onConfirm);
      cancelButton.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKeyDown);
      resolve(value);
    };
    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onKeyDown = (event) => {
      if (event.key === "Escape") finish(false);
    };

    confirmButton.addEventListener("click", onConfirm);
    cancelButton.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKeyDown);
    modal.hidden = false;
    confirmButton.focus();
  });
}

function countSentences(text) {
  return (text.match(/[.!?]+(?=\s|$)/g) || []).length;
}

function countWords(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function repairPdfExtractedText(text) {
  return String(text || "")
    .replace(/\ufb00/g, "ff")
    .replace(/\ufb01/g, "fi")
    .replace(/\ufb02/g, "fl")
    .replace(/\ufb03/g, "ffi")
    .replace(/\ufb04/g, "ffl")
    .replace(/\u01af/g, "ff")
    .replace(/\b([A-Za-z]+)-\s+([A-Za-z]+)\b/g, "$1-$2")
    .replace(/\b([Ee])\s*ff\s+ect/g, "$1ffect")
    .replace(/\b([Ee])\s*ff\s+ort/g, "$1ffort");
}

function normalizeText(text) {
  return repairPdfExtractedText(text).replace(/\s+/g, " ").trim();
}

function normalizeForMatch(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ");
}

function splitIntoSentences(text) {
  return normalizeText(text).match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
}

function isTitleCaseLike(text) {
  const words = normalizeText(text).match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (!words.length) return false;
  const titleWords = words.filter((word) => /^[A-Z]/.test(word) || word.length <= 3);
  return titleWords.length / words.length >= 0.7;
}

function isLikelyHeaderBlock(block, medianFont = 12) {
  const text = normalizeText(typeof block === "string" ? block : block?.text);
  if (!text) return false;

  const words = countWords(text);
  const sentenceCount = countSentences(text);
  const fontSize = Number(block?.fontSize) || medianFont;
  const fontWeight = Number(block?.fontWeight) || 400;
  const lineCount = block?.lineBoxes?.length || block?.lines?.length || 1;
  const fromOcr = isOcrDerivedText(block);
  const isEmphasized = fontWeight >= 650 || (!fromOcr && fontSize >= medianFont * 1.12);

  if (/^\d+[.)]?$/.test(text)) return true;
  if (/^page\s+\d+$/i.test(text)) return true;
  if (words <= 12 && sentenceCount <= 1 && /^\d+(?:\.\d+)*[.)]?\s+\S/.test(text)) return true;
  if (words <= 10 && /:$/.test(text)) return true;
  if (words <= 7 && sentenceCount <= 1 && isTitleCaseLike(text) && !/,/.test(text)) return true;
  if (words <= 9 && sentenceCount === 0 && isTitleCaseLike(text)) return true;
  if (words <= 12 && sentenceCount <= 1 && lineCount <= 2 && isEmphasized) return true;
  return false;
}

function isOcrDerivedText(item) {
  if (!item || typeof item === "string") return false;
  if (item.fromOcr || item.fontName === "OCR") return true;
  const lines = item.lineBoxes || item.lines || [];
  if (lines.some((line) => line.fromOcr || line.fontName === "OCR")) return true;
  const segments = item.segments || [];
  return segments.some((segment) => segment.fromOcr || segment.fontName === "OCR");
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

function numericTokenRatio(text) {
  const tokens = normalizeText(text).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  const numericTokens = tokens.filter((token) => /[\d%$=<>/]/.test(token));
  return numericTokens.length / tokens.length;
}

function isPageNumberText(text) {
  return /^\d+[.)]?$/.test(text) || /^page\s+\d+$/i.test(text);
}

function isBoundaryLabelLine(line, medianFont = 12) {
  return getBoundaryLabelReasons(line, medianFont).length > 0;
}

function hasLeadingListMarkerShape(text) {
  return /^[^A-Za-z0-9]{1,4}\s*[A-Za-z0-9]/.test(normalizeText(text));
}

function hasInlineLabelCalloutShape(text) {
  return /^[A-Z][^.!?]{2,36}:\s+\S/.test(normalizeText(text));
}

function getBoundaryLabelReasons(line, medianFont = 12) {
  const text = normalizeText(line.text);
  const reasons = [];
  if (!text) reasons.push("empty");
  if (isPageNumberText(text)) reasons.push("page-number");

  const words = countWords(text);
  const sentenceCount = countSentences(text);
  if (hasInlineLabelCalloutShape(text) && words <= 22) reasons.push("inline-label");
  if (words <= 10 && sentenceCount === 0 && /:$/.test(text)) reasons.push("punctuated-label");
  if (isLikelyHeaderBlock(line, medianFont)) reasons.push("header-like");
  return reasons;
}

function isMostlyShortLabelLines(lines) {
  if (!lines?.length) return true;
  const shortLabelLines = lines.filter((line) => {
    const text = normalizeText(line.text);
    const words = countWords(text);
    return (words <= 8 && (countSentences(text) === 0 || isTitleCaseLike(text) || /:$/.test(text)))
      || (hasLeadingListMarkerShape(text) && words <= 12);
  }).length;
  const averageWordsPerLine = lines.reduce((total, line) => total + countWords(line.text), 0) / Math.max(1, lines.length);
  return lines.length >= 3 && shortLabelLines / lines.length >= 0.55 && averageWordsPerLine <= 9;
}

function hasReasonableLineSpacing(lines, medianFont = 12) {
  if (!lines || lines.length < 3) return true;
  const ordered = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const gaps = [];
  for (let index = 1; index < ordered.length; index += 1) {
    gaps.push(ordered[index].y - (ordered[index - 1].y + ordered[index - 1].height));
  }
  const positiveGaps = gaps.filter((gap) => gap > 0);
  if (!positiveGaps.length) return true;
  const largeGaps = positiveGaps.filter((gap) => gap > medianFont * 4.5);
  return largeGaps.length / positiveGaps.length <= 0.25 && Math.max(...positiveGaps) <= medianFont * 12;
}

function isStrongParagraphReferenceLine(line, medianFont = 12, pageWidth = 0) {
  const text = normalizeText(line.text);
  if (!text || line.tableLike) return false;
  if (isBoundaryLabelLine(line, medianFont)) return false;
  if (numericTokenRatio(text) > 0.28) return false;

  const words = countWords(text);
  const sentenceCount = countSentences(text);
  const fontSize = Math.max(8, line.fontSize || medianFont);
  const normalFontSize = isOcrDerivedText(line) || Math.abs(fontSize - medianFont) <= Math.max(2.2, medianFont * 0.22);
  const normalWeight = (line.fontWeight || 400) < 650;
  const enoughText = words >= 7 || text.length >= 52 || (words >= 5 && sentenceCount > 0);
  const enoughWidth = line.width >= Math.max(medianFont * 10, (pageWidth || 0) * 0.12);
  return normalFontSize && normalWeight && enoughText && enoughWidth;
}

function getPageVisualReferenceLines(lines, pageWidth, medianFont = 12) {
  const strongLines = lines.filter((line) => isStrongParagraphReferenceLine(line, medianFont, pageWidth));
  if (strongLines.length >= 3) return strongLines;

  return lines
    .filter((line) => !line.tableLike)
    .filter((line) => !isBoundaryLabelLine(line, medianFont));
}

function getClampedSampleBox(ctx, rect, padding = 2) {
  if (!ctx) return null;
  const x = Math.max(0, Math.floor(rect.x - padding));
  const y = Math.max(0, Math.floor(rect.y - padding));
  const right = Math.min(ctx.canvas.width, Math.ceil(rect.x + rect.width + padding));
  const bottom = Math.min(ctx.canvas.height, Math.ceil(rect.y + rect.height + padding));
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function getUnionRect(rects) {
  const cleanRects = rects.filter((rect) => (
    rect
    && Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0
  ));
  if (!cleanRects.length) return null;

  const x = Math.min(...cleanRects.map((rect) => rect.x));
  const y = Math.min(...cleanRects.map((rect) => rect.y));
  const right = Math.max(...cleanRects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...cleanRects.map((rect) => rect.y + rect.height));
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

function getRectArea(rect) {
  if (!rect) return 0;
  return Math.max(0, rect.width || 0) * Math.max(0, rect.height || 0);
}

function getDominantColor(colors) {
  const buckets = new Map();
  colors.filter(Boolean).forEach((color) => {
    const key = [
      Math.round(color.red / 12) * 12,
      Math.round(color.green / 12) * 12,
      Math.round(color.blue / 12) * 12,
    ].join(",");
    const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += color.red;
    bucket.green += color.green;
    bucket.blue += color.blue;
    buckets.set(key, bucket);
  });
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return null;
  return {
    red: Math.round(dominant.red / dominant.count),
    green: Math.round(dominant.green / dominant.count),
    blue: Math.round(dominant.blue / dominant.count),
  };
}

function getDominantValue(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function readVisualSample(ctx, sampleBox) {
  if (!ctx || !sampleBox) return { backgroundColor: null, textColor: null, sampleBox: null };

  try {
    const pixels = ctx.getImageData(sampleBox.x, sampleBox.y, sampleBox.width, sampleBox.height).data;
    const backgroundColor = getDominantBackgroundColorFromPixels(pixels);
    return {
      backgroundColor,
      textColor: getDominantInkColorFromPixels(pixels, backgroundColor),
      sampleBox,
    };
  } catch (_) {
    return { backgroundColor: null, textColor: null, sampleBox: null };
  }
}

function getDominantInkColorFromPixels(pixels, background) {
  const buckets = new Map();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;

    const color = {
      red: pixels[index],
      green: pixels[index + 1],
      blue: pixels[index + 2],
    };
    if (getColorDistance(color, background) < 42) continue;
    if (getContrastRatio(color, background) < 1.35) continue;

    const key = [
      Math.round(color.red / 12) * 12,
      Math.round(color.green / 12) * 12,
      Math.round(color.blue / 12) * 12,
    ].join(",");
    const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += color.red;
    bucket.green += color.green;
    bucket.blue += color.blue;
    buckets.set(key, bucket);
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return null;
  return {
    red: Math.round(dominant.red / dominant.count),
    green: Math.round(dominant.green / dominant.count),
    blue: Math.round(dominant.blue / dominant.count),
  };
}

function sampleTextVisualStyle(ctx, rect) {
  const sampleBox = getClampedSampleBox(ctx, rect, 2);
  return readVisualSample(ctx, sampleBox);
}

function clampHorizontalBounds(left, right, pageWidth) {
  const maxRight = pageWidth || right;
  const clampedLeft = Math.max(0, Math.min(left, maxRight));
  const clampedRight = Math.max(clampedLeft, Math.min(right, maxRight));
  return { left: clampedLeft, right: clampedRight };
}

function getColumnSamplingBounds(line, columns = [], pageWidth = 0, medianFont = 12) {
  const columnIndex = columnIndexForLine(line, columns, pageWidth, medianFont);
  if (columnIndex === null) return null;

  const column = columns[columnIndex];
  if (!column) return null;

  const fontSize = Math.max(8, line.fontSize || medianFont);
  const pad = Math.max(fontSize * 1.5, medianFont * 1.25);
  return clampHorizontalBounds(
    Math.min(line.x - pad, column.minX - pad),
    Math.max(line.x + line.width + pad, column.maxRight + pad),
    pageWidth,
  );
}

function getNearbySamplingBounds(line, lines = [], pageWidth = 0, medianFont = 12) {
  if (!lines.length || isPageWideLine(line, pageWidth, medianFont)) return null;

  const fontSize = Math.max(8, line.fontSize || medianFont);
  const centerY = line.y + line.height / 2;
  const verticalWindow = Math.max(fontSize * 8, medianFont * 8);
  const xTolerance = Math.max(fontSize * 5, pageWidth * 0.04);
  const lineBox = { x: line.x, width: line.width };
  const fontTolerance = Math.max(2, medianFont * 0.22);

  const nearby = lines.filter((candidate) => {
    if (!candidate || candidate.id === line.id || candidate.tableLike) return false;
    if (isPageWideLine(candidate, pageWidth, medianFont)) return false;
    if (Math.abs((candidate.fontSize || fontSize) - fontSize) > fontTolerance) return false;
    const candidateCenterY = candidate.y + candidate.height / 2;
    if (Math.abs(candidateCenterY - centerY) > verticalWindow) return false;
    const sameColumn = Math.abs(candidate.x - line.x) <= xTolerance || textBlocksOverlap(lineBox, candidate) > 0.2;
    return sameColumn && candidate.textLength >= 12;
  });

  if (nearby.length < 1) return null;

  const scopedLines = [...nearby, line];
  const left = Math.min(line.x, median(scopedLines.map((candidate) => candidate.x)));
  const right = Math.max(
    line.x + line.width,
    median(scopedLines.map((candidate) => candidate.x + candidate.width)),
  );
  const pad = Math.max(fontSize * 2, medianFont * 1.5);
  return clampHorizontalBounds(left - pad, right + pad, pageWidth);
}

function getLineSamplingBounds(line, samplingContext = {}, pageWidth = 0, medianFont = 12) {
  return getColumnSamplingBounds(line, samplingContext.columns || [], pageWidth, medianFont)
    || getNearbySamplingBounds(line, samplingContext.lines || [], pageWidth, medianFont);
}

function getLineVisualSampleBoxes(ctx, line, medianFont = 12, pageWidth = ctx?.canvas?.width || 0, samplingContext = {}) {
  if (!ctx || !line) return [];
  const effectivePageWidth = pageWidth || ctx.canvas.width;
  const fontSize = Math.max(8, line.fontSize || medianFont);
  const localPadX = Math.max(6, fontSize * 0.9);
  const localPadY = Math.max(2, fontSize * 0.32);
  const bandPadY = Math.max(3, fontSize * 0.45);
  const samplingBounds = getLineSamplingBounds(line, samplingContext, effectivePageWidth, medianFont);
  const fallbackBandWidth = Math.min(effectivePageWidth * 0.72, Math.max(line.width + fontSize * 4, fontSize * 14));
  const boundedBandWidth = samplingBounds ? samplingBounds.right - samplingBounds.left : fallbackBandWidth;
  const bandWidth = Math.min(
    effectivePageWidth,
    Math.max(line.width + fontSize * 2.6, Math.min(boundedBandWidth, fallbackBandWidth)),
  );
  const lineCenter = line.x + line.width / 2;
  const minBandX = samplingBounds ? samplingBounds.left : 0;
  const maxBandX = samplingBounds ? samplingBounds.right - bandWidth : effectivePageWidth - bandWidth;
  const bandX = Math.max(minBandX, Math.min(maxBandX, lineCenter - bandWidth / 2));
  const candidates = [
    {
      x: line.x - localPadX,
      y: line.y - localPadY,
      width: line.width + localPadX * 2,
      height: Math.max(line.height + localPadY * 2, fontSize * 1.45),
    },
    {
      x: bandX,
      y: line.y - bandPadY,
      width: bandWidth,
      height: Math.max(line.height + bandPadY * 2, fontSize * 1.75),
    },
  ];

  return candidates
    .map((candidate) => getClampedSampleBox(ctx, candidate, 0))
    .filter(Boolean);
}

function sampleLineVisualStyle(ctx, line, medianFont = 12, pageWidth = ctx?.canvas?.width || 0, samplingContext = {}) {
  const sampleBoxes = getLineVisualSampleBoxes(ctx, line, medianFont, pageWidth, samplingContext);
  if (!sampleBoxes.length) {
    return {
      backgroundColor: line.backgroundColor || null,
      textColor: line.textColor || null,
      sampleBox: line.sampleBox || null,
    };
  }

  const samples = sampleBoxes.map((sampleBox) => readVisualSample(ctx, sampleBox));
  const backgroundColor = getDominantColor([
    ...samples.map((sample) => sample.backgroundColor),
    line.backgroundColor,
  ]);
  const textColor = getDominantColor([
    line.textColor,
    ...samples.map((sample) => sample.textColor),
  ]);
  const sampleBox = sampleBoxes.sort((a, b) => getRectArea(b) - getRectArea(a))[0] || line.sampleBox || null;

  return {
    backgroundColor,
    textColor,
    sampleBox,
  };
}

function getLineVisualReference(lines) {
  return {
    backgroundColor: getDominantColor(lines.map((line) => line.backgroundColor)),
    textColor: getDominantColor(lines.map((line) => line.textColor)),
    fontFamily: getDominantValue(lines.map((line) => line.fontFamily)),
    fontStyle: getDominantValue(lines.map((line) => line.fontStyle)),
    fontSize: median(lines.map((line) => line.fontSize)),
    fontWeight: median(lines.map((line) => line.fontWeight)),
  };
}

function hasMeaningfulBackgroundChange(line, reference) {
  if (!line.backgroundColor || !reference?.backgroundColor) return false;
  const distance = getColorDistance(line.backgroundColor, reference.backgroundColor);
  const brightnessA = (line.backgroundColor.red + line.backgroundColor.green + line.backgroundColor.blue) / 3;
  const brightnessB = (reference.backgroundColor.red + reference.backgroundColor.green + reference.backgroundColor.blue) / 3;
  return distance >= 18 && Math.abs(brightnessA - brightnessB) >= 10;
}

function hasMeaningfulTextColorChange(line, reference) {
  if (!line.textColor || !reference?.textColor) return false;
  return getColorDistance(line.textColor, reference.textColor) >= 72;
}

function hasMeaningfulFontChange(line, reference, medianFont = 12) {
  if (!reference) return false;
  const fontSizeChanged = reference.fontSize
    && Math.abs(line.fontSize - reference.fontSize) >= Math.max(2, medianFont * 0.16);
  const fontWeightChanged = Math.abs((line.fontWeight || 400) - (reference.fontWeight || 400)) >= 250;
  const fontFamilyChanged = reference.fontFamily && line.fontFamily && line.fontFamily !== reference.fontFamily;
  const fontStyleChanged = reference.fontStyle && line.fontStyle && line.fontStyle !== reference.fontStyle;
  return fontSizeChanged || fontWeightChanged || fontFamilyChanged || fontStyleChanged;
}

function getLineVisualOutlierReasons(line, pageVisualReference, medianFont = 12) {
  const reasons = [];
  const words = countWords(line.text);
  const fromOcr = isOcrDerivedText(line);
  const visuallyEmphasized = (line.fontWeight || 400) >= 650
    || line.fontSize >= medianFont * (fromOcr ? 1.35 : 1.08);
  if (hasMeaningfulBackgroundChange(line, pageVisualReference)) reasons.push("background");
  if (
    !fromOcr
    && words <= 10
    && hasMeaningfulTextColorChange(line, pageVisualReference)
    && visuallyEmphasized
  ) reasons.push("text-color");
  if (!fromOcr && words <= 16 && hasMeaningfulFontChange(line, pageVisualReference, medianFont)) reasons.push("font");
  return reasons;
}

function isLineVisualOutlier(line, pageVisualReference, medianFont = 12) {
  return getLineVisualOutlierReasons(line, pageVisualReference, medianFont).length > 0;
}

function isLineVisualBoundary(line, current, medianFont = 12) {
  if (!current?.lines?.length) return false;
  const fromOcr = isOcrDerivedText(line);
  const currentReference = getLineVisualReference(current.lines);
  if (hasMeaningfulBackgroundChange(line, currentReference)) return true;
  if (!fromOcr && hasMeaningfulFontChange(line, currentReference, medianFont)) return true;
  if (
    !fromOcr
    && countWords(line.text) <= 10
    && hasMeaningfulTextColorChange(line, currentReference)
    && ((line.fontWeight || 400) >= 650 || line.fontSize >= medianFont * (fromOcr ? 1.35 : 1.08))
  ) return true;
  return false;
}

function splitLineSpansIntoRuns(orderedSpans, medianFont, pageWidth) {
  const runs = [];
  let currentRun = [];
  let currentRight = null;
  const gapThreshold = Math.max(medianFont * 4.5, Math.min(76, pageWidth * 0.055));

  orderedSpans.forEach((span) => {
    const gap = currentRight === null ? 0 : span.x - currentRight;
    if (currentRun.length && gap > gapThreshold) {
      runs.push(currentRun);
      currentRun = [];
      currentRight = null;
    }

    currentRun.push(span);
    const spanRight = span.x + span.width;
    currentRight = currentRight === null ? spanRight : Math.max(currentRight, spanRight);
  });

  if (currentRun.length) runs.push(currentRun);
  return runs;
}

function isLikelyTableRow(runs, rowText) {
  const sentenceCount = countSentences(rowText);
  const rowWords = countWords(rowText);
  const compactRuns = runs.filter((run) => countWords(run.map((span) => span.text).join(" ")) <= 7).length;
  const numericRuns = runs.filter((run) => numericTokenRatio(run.map((span) => span.text).join(" ")) >= 0.34).length;

  if (runs.length >= 3 && compactRuns >= Math.ceil(runs.length * 0.6) && sentenceCount <= 1) return true;
  if (runs.length >= 3 && sentenceCount === 0 && rowWords <= 24) return true;
  if (runs.length >= 2 && numericRuns >= 1 && compactRuns === runs.length && rowWords <= 14) return true;
  return false;
}

function buildLineFromSpans(ordered, id, tableLike, rowRunCount) {
  const text = normalizeText(ordered.map((span) => span.text).join(" "));
  const x = Math.min(...ordered.map((span) => span.x));
  const y = Math.min(...ordered.map((span) => span.y));
  const right = Math.max(...ordered.map((span) => span.x + span.width));
  const bottom = Math.max(...ordered.map((span) => span.y + span.height));

  return {
    id,
    text,
    x,
    y,
    width: right - x,
    height: bottom - y,
    fontSize: median(ordered.map((span) => span.fontSize)),
    fontWeight: median(ordered.map((span) => span.fontWeight)),
    fontFamily: getDominantValue(ordered.map((span) => span.fontFamily)),
    fontName: getDominantValue(ordered.map((span) => span.fontName)),
    fontStyle: getDominantValue(ordered.map((span) => span.fontStyle)),
    fromOcr: ordered.some((span) => span.fromOcr || span.fontName === "OCR"),
    backgroundColor: getDominantColor(ordered.map((span) => span.backgroundColor)),
    textColor: getDominantColor(ordered.map((span) => span.textColor)),
    sampleBox: getUnionRect(ordered.map((span) => span.sampleBox)),
    sampleBoxes: ordered.map((span) => span.sampleBox).filter(Boolean),
    textLength: text.length,
    tableLike,
    rowRunCount,
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
      fromOcr: span.fromOcr || span.fontName === "OCR",
      backgroundColor: span.backgroundColor,
      textColor: span.textColor,
      sampleBox: span.sampleBox,
      text: span.text,
      textLength: span.textLength,
    })),
  };
}

function isSameTextColumn(current, line, medianFont) {
  if (!current) return false;
  const currentBox = { x: current.x, width: current.width };
  return Math.abs(line.x - current.x) < medianFont * 5 || textBlocksOverlap(currentBox, line) > 0.28;
}

function getCurrentBlockText(current) {
  return normalizeText(current.lines.map((line) => line.text).join(" "));
}

function getLineGroupBounds(lines) {
  const x = Math.min(...lines.map((line) => line.x));
  const right = Math.max(...lines.map((line) => line.x + line.width));
  return { x, width: right - x };
}

function classifyBlock(block, medianFont) {
  const text = block.text.trim();
  const fromOcr = isOcrDerivedText(block);
  if (isLikelyHeaderBlock(block, medianFont)) return block.fontSize >= medianFont * 1.35 ? "title" : "header";
  if (/^(\u2022|[-*]|[0-9]+[.)])\s+/.test(text)) return "bullet";
  if (!fromOcr && block.fontSize >= medianFont * 1.35 && text.length < 120) return "title";
  if (!fromOcr && block.fontSize >= medianFont * 1.12 && text.length < 140) return "header";
  if (countSentences(text) > 2 && text.length > 180) return "paragraph";
  return "text";
}

function isPageWideLine(line, pageWidth, medianFont) {
  const center = line.x + line.width / 2;
  const centered = Math.abs(center - pageWidth / 2) <= pageWidth * 0.12;
  return line.width >= pageWidth * 0.68 || (centered && line.width >= pageWidth * 0.42 && line.fontSize >= medianFont * 1.08);
}

function summarizeColumn(lines) {
  const lefts = lines.map((line) => line.x);
  const rights = lines.map((line) => line.x + line.width);
  return {
    lines,
    x: median(lefts),
    right: median(rights),
    minX: Math.min(...lefts),
    maxRight: Math.max(...rights),
    top: Math.min(...lines.map((line) => line.y)),
    bottom: Math.max(...lines.map((line) => line.y + line.height)),
  };
}

function detectTextColumns(lines, pageWidth, medianFont) {
  const candidates = lines
    .filter((line) => !line.tableLike)
    .filter((line) => !isPageWideLine(line, pageWidth, medianFont))
    .filter((line) => line.textLength >= 18 && line.width >= medianFont * 7)
    .filter((line) => line.width <= pageWidth * 0.64);

  if (candidates.length < 6) return [];

  const columns = [];
  const xTolerance = Math.max(medianFont * 5, pageWidth * 0.045);

  [...candidates].sort((a, b) => a.x - b.x).forEach((line) => {
    let bestColumn = null;
    let bestScore = 0;

    columns.forEach((column) => {
      const columnBox = { x: column.minX, width: column.maxRight - column.minX };
      const overlap = textBlocksOverlap(columnBox, line);
      const leftDiff = Math.abs(line.x - column.x);
      const score = overlap + (leftDiff <= xTolerance ? 1 - (leftDiff / xTolerance) : 0);
      if (score > bestScore) {
        bestScore = score;
        bestColumn = column;
      }
    });

    if (bestColumn && bestScore >= 0.28) {
      bestColumn.lines.push(line);
      Object.assign(bestColumn, summarizeColumn(bestColumn.lines));
      return;
    }

    columns.push(summarizeColumn([line]));
  });

  const usableColumns = columns
    .filter((column) => column.lines.length >= 3)
    .sort((a, b) => a.x - b.x);

  if (usableColumns.length < 2) return [];

  const hasColumnGutter = usableColumns.some((column, index) => {
    if (index === 0) return false;
    return column.x - usableColumns[index - 1].right >= Math.max(medianFont * 4, pageWidth * 0.055);
  });

  return hasColumnGutter ? usableColumns : [];
}

function columnIndexForLine(line, columns, pageWidth, medianFont) {
  if (!columns.length || line.tableLike || isPageWideLine(line, pageWidth, medianFont)) return null;

  const center = line.x + line.width / 2;
  const tolerance = Math.max(medianFont * 5, pageWidth * 0.045);
  let bestIndex = null;
  let bestScore = 0;

  columns.forEach((column, index) => {
    const columnBox = { x: column.minX, width: column.maxRight - column.minX };
    const overlap = textBlocksOverlap(columnBox, line);
    const centerInside = center >= column.minX - tolerance && center <= column.maxRight + tolerance;
    const leftClose = Math.abs(line.x - column.x) <= tolerance;
    const score = overlap + (centerInside ? 0.45 : 0) + (leftClose ? 0.25 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 0.3 ? bestIndex : null;
}

function sortLinesForReadingOrder(lines, pageWidth, medianFont) {
  const naturalOrder = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const columns = detectTextColumns(naturalOrder, pageWidth, medianFont);
  if (columns.length < 2) return naturalOrder;

  const wideAnchors = naturalOrder.filter((line) => isPageWideLine(line, pageWidth, medianFont));
  const anchorIndexById = new Map(wideAnchors.map((line, index) => [line.id, index]));
  const bandThreshold = medianFont * 0.75;

  const keyForLine = (line) => {
    const anchorIndex = anchorIndexById.get(line.id);
    if (anchorIndex !== undefined) return [anchorIndex * 2 + 1, 0, line.y, line.x];

    const band = wideAnchors.filter((anchor) => anchor.y + anchor.height < line.y - bandThreshold).length;
    const columnIndex = columnIndexForLine(line, columns, pageWidth, medianFont);
    if (columnIndex !== null) return [band * 2, 1, columnIndex, line.y, line.x];
    return [band * 2, 2, line.y, line.x];
  };

  return naturalOrder.sort((a, b) => {
    const aKey = keyForLine(a);
    const bKey = keyForLine(b);
    const maxLength = Math.max(aKey.length, bKey.length);
    for (let index = 0; index < maxLength; index += 1) {
      const difference = (aKey[index] ?? 0) - (bKey[index] ?? 0);
      if (difference) return difference;
    }
    return 0;
  });
}

function isLikelyTableBlock(block) {
  const lines = block.lineBoxes || block.lines || [];
  if (lines.length < 2) return false;

  const text = normalizeText(block.text || lines.map((line) => line.text).join(" "));
  const sentenceCount = countSentences(text);
  const tableLineCount = lines.filter((line) => line.tableLike).length;
  const shortLineCount = lines.filter((line) => countWords(line.text) <= 8 && countSentences(line.text) === 0).length;
  const averageWordsPerLine = countWords(text) / Math.max(1, lines.length);
  const numberRatio = numericTokenRatio(text);

  if (tableLineCount >= 2 && tableLineCount / lines.length >= 0.45 && sentenceCount <= Math.max(1, Math.floor(lines.length / 2))) return true;
  if (lines.length >= 3 && shortLineCount / lines.length >= 0.75 && numberRatio >= 0.25 && sentenceCount <= 1) return true;
  if (lines.length >= 3 && averageWordsPerLine <= 7 && numberRatio >= 0.35) return true;
  return false;
}

function summarizeBlockVisualDivergence(block, visualReference, medianFont = 12) {
  const lines = block.lineBoxes || block.lines || [];
  if (!lines.length || !visualReference) {
    return {
      lineCount: lines.length,
      backgroundLineCount: 0,
      textColorLineCount: 0,
      fontLineCount: 0,
      backgroundRatio: 0,
      textColorRatio: 0,
      fontRatio: 0,
    };
  }

  const backgroundLineCount = lines.filter((line) => hasMeaningfulBackgroundChange(line, visualReference)).length;
  const textColorLineCount = lines.filter((line) => hasMeaningfulTextColorChange(line, visualReference)).length;
  const fontLineCount = lines.filter((line) => hasMeaningfulFontChange(line, visualReference, medianFont)).length;
  return {
    lineCount: lines.length,
    backgroundLineCount,
    textColorLineCount,
    fontLineCount,
    backgroundRatio: backgroundLineCount / lines.length,
    textColorRatio: textColorLineCount / lines.length,
    fontRatio: fontLineCount / lines.length,
  };
}

function hasVisualCalloutStyle(block, medianFont = 12) {
  const divergence = block.visualDivergence
    || summarizeBlockVisualDivergence(block, block.visualReference, medianFont);
  if (!divergence.lineCount) return false;
  if (divergence.backgroundLineCount >= 2 && divergence.backgroundRatio >= 0.2) return true;
  if (divergence.backgroundLineCount >= 1 && divergence.backgroundRatio >= 0.5) return true;
  return false;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 12;
  return sorted[Math.floor(sorted.length / 2)];
}

function extractBlocksFromTextContent(textContent, viewport, pageNumber, analysisContext = null) {
  const spans = textContent.items
    .map((item, index) => {
      const text = normalizeText(item.str || "");
      if (!text) return null;
      const textMatrix = transformMatrix(viewport.transform, item.transform);
      const x = textMatrix[4];
      const baselineY = textMatrix[5];
      const fontSize = Math.max(8, Math.hypot(textMatrix[2], textMatrix[3]) || getFontSize(item) * viewport.scale);
      const pdfWidth = (item.width || 0) * viewport.scale;
      const estimatedWidth = text.length * fontSize * 0.42;
      const width = Math.max(pdfWidth || estimatedWidth, 8);
      const y = baselineY - fontSize;
      const height = fontSize * 1.35;
      const visualStyle = sampleTextVisualStyle(analysisContext, { x, y, width, height });
      return {
        id: `p${pageNumber}-s${index}`,
        text,
        x,
        y,
        baselineY,
        width,
        height,
        fontSize,
        fontFamily: getFontFamily(item.fontName, textContent),
        fontName: item.fontName || "",
        fontStyle: getFontStyle(item.fontName),
        fontWeight: getFontWeight(item.fontName),
        backgroundColor: visualStyle.backgroundColor,
        textColor: visualStyle.textColor,
        sampleBox: visualStyle.sampleBox,
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

  let lineIndex = 0;
  const naturalLines = [...lineMap.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, lineSpans]) => {
      const ordered = lineSpans.sort((a, b) => a.x - b.x);
      const runs = splitLineSpansIntoRuns(ordered, medianFont, viewport.width);
      const rowText = normalizeText(ordered.map((span) => span.text).join(" "));
      const rowLooksTableLike = isLikelyTableRow(runs, rowText);
      return runs.map((run) => {
        lineIndex += 1;
        return buildLineFromSpans(run, `p${pageNumber}-l${lineIndex}`, rowLooksTableLike, runs.length);
      });
    });

  const visualSamplingContext = {
    lines: naturalLines,
    columns: detectTextColumns(naturalLines, viewport.width, medianFont),
  };

  if (analysisContext) {
    naturalLines.forEach((line) => {
      const visualStyle = sampleLineVisualStyle(
        analysisContext,
        line,
        medianFont,
        viewport.width,
        visualSamplingContext,
      );
      line.backgroundColor = visualStyle.backgroundColor || line.backgroundColor;
      line.textColor = visualStyle.textColor || line.textColor;
      line.sampleBox = visualStyle.sampleBox || line.sampleBox;
    });
  }

  const lines = sortLinesForReadingOrder(naturalLines, viewport.width, medianFont);

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
      fontWeight: line.fontWeight,
      fontFamily: line.fontFamily,
      fontName: line.fontName,
      fontStyle: line.fontStyle,
      backgroundColor: line.backgroundColor,
      textColor: line.textColor,
      sampleBox: line.sampleBox,
      sampleBoxes: line.sampleBoxes || [],
      text: line.text,
      textLength: line.textLength,
      tableLike: Boolean(line.tableLike),
      rowRunCount: line.rowRunCount || 1,
      segments: line.segments,
    }));
    current.spanIds = current.lineBoxes.flatMap((line) => line.segments.map((segment) => segment.id));
    current.tableLike = isLikelyTableBlock(current);
    current.kind = current.tableLike ? "table" : classifyBlock(current, medianFont);
    current.visualReference = pageVisualReference;
    current.visualDivergence = summarizeBlockVisualDivergence(current, pageVisualReference, medianFont);
    delete current.lines;
    blocks.push(current);
    current = null;
  };

  const pageVisualReference = getLineVisualReference(getPageVisualReferenceLines(lines, viewport.width, medianFont));
  const visualDebugLines = [];
  const addVisualDebugLine = (line, status, details = {}) => {
    visualDebugLines.push({
      id: line.id,
      status,
      text: line.text,
      x: line.x,
      y: line.y,
      width: line.width,
      height: line.height,
      sampleBox: line.sampleBox,
      sampleBoxes: line.sampleBoxes || [],
      backgroundColor: line.backgroundColor,
      textColor: line.textColor,
      fontSize: line.fontSize,
      fontWeight: line.fontWeight,
      tableLike: Boolean(line.tableLike),
      ...details,
    });
  };

  lines.forEach((line) => {
    const boundaryReasons = getBoundaryLabelReasons(line, medianFont);
    const boundaryLabel = boundaryReasons.length > 0;
    const visualOutlierReasons = getLineVisualOutlierReasons(line, pageVisualReference, medianFont);
    const visualOutlier = visualOutlierReasons.length > 0;

    if (line.tableLike || boundaryLabel || visualOutlier) {
      addVisualDebugLine(line, line.tableLike ? "table" : boundaryLabel ? "boundary-label" : "visual-outlier", {
        boundaryLabel,
        visualOutlier,
        reasons: [
          ...(line.tableLike ? ["table-row"] : []),
          ...boundaryReasons,
          ...visualOutlierReasons,
        ],
      });
      flush();
      return;
    }

    const visualBoundary = isLineVisualBoundary(line, current, medianFont);
    if (visualBoundary) {
      addVisualDebugLine(line, "visual-boundary", { visualBoundary });
      flush();
    } else {
      addVisualDebugLine(line, "kept");
    }

    const lastLine = current?.lines[current.lines.length - 1];
    const gap = lastLine ? line.y - (lastLine.y + lastLine.height) : 999;
    const sameColumn = isSameTextColumn(current, line, medianFont);
    const lineKind = classifyBlock(line, medianFont);
    const currentKind = current ? classifyBlock({ ...current, text: getCurrentBlockText(current) }, medianFont) : null;
    const lineLooksStandalone = lineKind !== "text";
    const normalTextFlow = sameColumn && gap <= medianFont * 2.15;
    const continuationTextFlow = sameColumn && currentKind === "text" && lineKind === "text" && gap <= medianFont * 5.5;
    const headerBoundary = ["header", "title"].includes(currentKind) && lineKind === "text";

    if (!current || lineLooksStandalone || headerBoundary || (!normalTextFlow && !continuationTextFlow)) {
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
        fontWeight: line.fontWeight,
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
    current.fontWeight = median(current.lines.map((l) => l.fontWeight));
  });
  flush();

  return {
    items: blocks.map((block) => {
      const item = {
        ...block,
        x: Math.max(0, block.x - 2),
        y: Math.max(0, block.y - 2),
        width: Math.min(viewport.width - block.x, block.width + 6),
        height: block.height + 4,
        textLength: block.text.length,
      };
      item.sourceRejectReason = getSourceBlockRejectReason(item);
      return item;
    }),
    textSpans: spans,
    debugLines: visualDebugLines,
  };
}

function getSelectableTextStats(pages = state.pages) {
  const selectableText = normalizeText(
    pages
      .flatMap((page) => page.textSpans || [])
      .map((span) => span.text)
      .join(" "),
  );
  return {
    words: countWords(selectableText),
    spans: pages.reduce((total, page) => total + (page.textSpans?.length || 0), 0),
    sourceBlocks: pages.flatMap((page) => page.items || []).filter(isReadableSourceBlock).length,
  };
}

function shouldTryOcrForParsedPdf(pages, pageCount) {
  if (!pageCount) return false;
  const stats = getSelectableTextStats(pages);
  if (stats.sourceBlocks > SCANNED_SOURCE_BLOCK_LIMIT) return false;
  return stats.words <= Math.max(SCANNED_SELECTABLE_WORD_LIMIT, pageCount * 8)
    || stats.spans <= pageCount * 3;
}

function getOcrBox(node) {
  const box = node?.bbox || node?.box || null;
  if (box && Number.isFinite(box.x0) && Number.isFinite(box.y0) && Number.isFinite(box.x1) && Number.isFinite(box.y1)) {
    return {
      left: box.x0,
      top: box.y0,
      width: box.x1 - box.x0,
      height: box.y1 - box.y0,
    };
  }
  if (box && Number.isFinite(box.left) && Number.isFinite(box.top) && Number.isFinite(box.width) && Number.isFinite(box.height)) {
    return {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    };
  }
  if (Number.isFinite(node?.left) && Number.isFinite(node?.top) && Number.isFinite(node?.width) && Number.isFinite(node?.height)) {
    return {
      left: node.left,
      top: node.top,
      width: node.width,
      height: node.height,
    };
  }
  return null;
}

function parseOcrTsv(tsv) {
  if (!tsv || typeof tsv !== "string") return [];
  const rows = tsv.trim().split(/\r?\n/);
  if (rows.length < 2) return [];
  const headers = rows[0].split("\t");
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const read = (cells, key) => cells[indexByHeader.get(key)] ?? "";

  return rows.slice(1).map((row) => {
    const cells = row.split("\t");
    const text = normalizeText(read(cells, "text"));
    const left = Number(read(cells, "left"));
    const top = Number(read(cells, "top"));
    const width = Number(read(cells, "width"));
    const height = Number(read(cells, "height"));
    return {
      text,
      confidence: Number(read(cells, "conf")),
      blockNumber: read(cells, "block_num"),
      paragraphNumber: read(cells, "par_num"),
      lineNumber: read(cells, "line_num"),
      box: { left, top, width, height },
    };
  }).filter((word) => (
    word.text
    && Number.isFinite(word.box.left)
    && Number.isFinite(word.box.top)
    && Number.isFinite(word.box.width)
    && Number.isFinite(word.box.height)
    && word.box.width > 0
    && word.box.height > 0
  ));
}

function collectOcrWords(data) {
  if (Array.isArray(data?.words) && data.words.length) {
    return data.words.map((word) => {
      const box = getOcrBox(word);
      return {
        text: normalizeText(word.text || word.symbols?.map((symbol) => symbol.text).join("") || ""),
        confidence: Number(word.confidence),
        box,
      };
    }).filter((word) => word.text && word.box?.width > 0 && word.box?.height > 0);
  }
  return parseOcrTsv(data?.tsv);
}

function getOtsuThresholdFromImageData(imageData) {
  const histogram = new Uint32Array(256);
  const pixels = imageData.data;
  let total = 0;
  let weightedTotal = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = Math.round((pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114));
    histogram[luminance] += 1;
    total += 1;
    weightedTotal += luminance;
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let threshold = 180;

  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;

    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }

  return Math.max(90, Math.min(220, threshold));
}

function collectDeskewInkPoints(canvas) {
  const scale = Math.min(1, OCR_DESKEW_SAMPLE_WIDTH / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true }) || sampleCanvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(canvas, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const threshold = getOtsuThresholdFromImageData(imageData);
  const pixels = imageData.data;
  const points = [];
  const marginX = Math.max(4, Math.floor(width * 0.025));
  const marginY = Math.max(4, Math.floor(height * 0.025));
  const stride = Math.max(1, Math.round(Math.max(width, height) / 700));

  for (let y = marginY; y < height - marginY; y += stride) {
    for (let x = marginX; x < width - marginX; x += stride) {
      const index = ((y * width) + x) * 4;
      const luminance = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
      if (luminance < threshold - 8) points.push({ x, y });
    }
  }

  if (points.length < 240) return null;
  return { points, width, height, scale };
}

function getProjectionScoreForAngle(sample, angleDegrees) {
  const radians = angleDegrees * Math.PI / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const centerX = sample.width / 2;
  const centerY = sample.height / 2;
  const rows = new Uint16Array(Math.ceil(sample.height * 1.3) + 16);
  const rowOffset = Math.floor((rows.length - sample.height) / 2);

  sample.points.forEach((point) => {
    const rotatedY = ((point.x - centerX) * sin) + ((point.y - centerY) * cos) + centerY;
    const row = Math.round(rotatedY) + rowOffset;
    if (row >= 0 && row < rows.length) rows[row] += 1;
  });

  let score = 0;
  for (let index = 1; index < rows.length - 1; index += 1) {
    const smoothed = rows[index - 1] + rows[index] * 2 + rows[index + 1];
    score += smoothed * smoothed;
  }
  return score / Math.max(1, sample.points.length);
}

function scanProjectionAngles(sample, startAngle, endAngle, step) {
  let best = { angle: 0, score: -Infinity };
  for (let angle = startAngle; angle <= endAngle + step / 2; angle += step) {
    const roundedAngle = Math.round(angle * 1000) / 1000;
    const score = getProjectionScoreForAngle(sample, roundedAngle);
    if (score > best.score) best = { angle: roundedAngle, score };
  }
  return best;
}

function estimateDeskewByProjection(canvas) {
  const sample = collectDeskewInkPoints(canvas);
  if (!sample) {
    return {
      angle: 0,
      confidence: 0,
      applied: false,
      reason: "not-enough-ink",
    };
  }

  const zeroScore = getProjectionScoreForAngle(sample, 0);
  const coarse = scanProjectionAngles(sample, -OCR_DESKEW_MAX_ANGLE, OCR_DESKEW_MAX_ANGLE, OCR_DESKEW_COARSE_STEP);
  const fineStart = Math.max(-OCR_DESKEW_MAX_ANGLE, coarse.angle - OCR_DESKEW_COARSE_STEP);
  const fineEnd = Math.min(OCR_DESKEW_MAX_ANGLE, coarse.angle + OCR_DESKEW_COARSE_STEP);
  const fine = scanProjectionAngles(sample, fineStart, fineEnd, OCR_DESKEW_FINE_STEP);
  const confidence = (fine.score - zeroScore) / Math.max(1, zeroScore);
  const applied = Math.abs(fine.angle) >= OCR_DESKEW_MIN_APPLY_ANGLE && confidence >= OCR_DESKEW_MIN_CONFIDENCE;

  return {
    angle: applied ? fine.angle : 0,
    detectedAngle: fine.angle,
    confidence,
    applied,
    zeroScore,
    bestScore: fine.score,
    sampleScale: sample.scale,
    inkPointCount: sample.points.length,
    reason: applied ? "applied" : "below-threshold",
  };
}

function deskewCanvasByAngle(canvas, angleDegrees) {
  const radians = angleDegrees * Math.PI / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const width = canvas.width;
  const height = canvas.height;
  const outputWidth = Math.ceil(Math.abs(width * cos) + Math.abs(height * sin));
  const outputHeight = Math.ceil(Math.abs(width * sin) + Math.abs(height * cos));
  const deskewed = document.createElement("canvas");
  deskewed.width = outputWidth;
  deskewed.height = outputHeight;
  const ctx = deskewed.getContext("2d", { willReadFrequently: true }) || deskewed.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outputWidth, outputHeight);
  ctx.translate(outputWidth / 2, outputHeight / 2);
  ctx.rotate(radians);
  ctx.drawImage(canvas, -width / 2, -height / 2);

  return {
    canvas: deskewed,
    angle: angleDegrees,
    sourceWidth: width,
    sourceHeight: height,
    outputWidth,
    outputHeight,
    sin,
    cos,
  };
}

function mapPointFromDeskewedToOriginal(point, transform) {
  const x = point.x - transform.outputWidth / 2;
  const y = point.y - transform.outputHeight / 2;
  return {
    x: (x * transform.cos) + (y * transform.sin) + transform.sourceWidth / 2,
    y: (-x * transform.sin) + (y * transform.cos) + transform.sourceHeight / 2,
  };
}

function mapRectFromDeskewedToOriginal(rect, transform) {
  if (!transform) return rect;
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.left + rect.width, y: rect.top },
    { x: rect.left + rect.width, y: rect.top + rect.height },
    { x: rect.left, y: rect.top + rect.height },
  ].map((corner) => mapPointFromDeskewedToOriginal(corner, transform));

  const left = Math.max(0, Math.min(...corners.map((corner) => corner.x)));
  const top = Math.max(0, Math.min(...corners.map((corner) => corner.y)));
  const right = Math.min(transform.sourceWidth, Math.max(...corners.map((corner) => corner.x)));
  const bottom = Math.min(transform.sourceHeight, Math.max(...corners.map((corner) => corner.y)));
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function mapOcrWordsToOriginalCanvas(words, deskewTransform = null) {
  if (!deskewTransform) return words;
  return words.map((word) => ({
    ...word,
    box: mapRectFromDeskewedToOriginal(word.box, deskewTransform),
  })).filter((word) => word.box.width > 0 && word.box.height > 0);
}

function mapOcrRectToViewport(rect, viewport, ocrViewport, deskewTransform = null) {
  const sourceRect = deskewTransform
    ? mapRectFromDeskewedToOriginal(rect, deskewTransform)
    : rect;
  const scaleX = viewport.width / Math.max(1, ocrViewport.width);
  const scaleY = viewport.height / Math.max(1, ocrViewport.height);
  return {
    x: sourceRect.left * scaleX,
    y: sourceRect.top * scaleY,
    width: sourceRect.width * scaleX,
    height: sourceRect.height * scaleY,
  };
}

function mapOcrSpanToViewport(span, viewport, ocrViewport, analysisContext = null, deskewTransform = null) {
  const rect = mapOcrRectToViewport({
    left: span.x,
    top: span.y,
    width: span.width,
    height: span.height,
  }, viewport, ocrViewport, deskewTransform);
  const fontSize = Math.max(8, rect.height * 0.78);
  const visualStyle = sampleTextVisualStyle(analysisContext, rect);
  return {
    ...span,
    x: rect.x,
    y: rect.y,
    baselineY: rect.y + rect.height * 0.82,
    width: rect.width,
    height: rect.height,
    fontSize,
    backgroundColor: visualStyle.backgroundColor,
    textColor: visualStyle.textColor,
    sampleBox: visualStyle.sampleBox,
  };
}

function mapOcrLineToViewport(line, viewport, ocrViewport, analysisContext = null, deskewTransform = null) {
  const mappedSegments = line.segments.map((segment) => mapOcrSpanToViewport(
    segment,
    viewport,
    ocrViewport,
    analysisContext,
    deskewTransform,
  ));
  return buildLineFromSpans(mappedSegments, line.id, line.tableLike, line.rowRunCount);
}

function buildOcrLinesFromWords(words, viewport, ocrViewport, pageNumber, analysisContext = null, deskewTransform = null) {
  const workingPageWidth = deskewTransform?.outputWidth || ocrViewport.width;
  const workingWords = words;

  const workingSpans = workingWords
    .filter((word) => !Number.isFinite(word.confidence) || word.confidence >= 25)
    .map((word, index) => {
      const x = word.box.left;
      const y = word.box.top;
      const width = word.box.width;
      const height = word.box.height;
      const fontSize = Math.max(8, height * 0.78);
      return {
        id: `p${pageNumber}-ocr-s${index}`,
        text: word.text,
        x,
        y,
        baselineY: y + height * 0.82,
        width,
        height,
        fontSize,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontName: "OCR",
        fontStyle: "normal",
        fontWeight: 400,
        fromOcr: true,
        backgroundColor: null,
        textColor: null,
        sampleBox: null,
        textLength: word.text.length,
      };
    })
    .filter((span) => span.text && span.width > 0 && span.height > 0);

  const workingMedianFont = median(workingSpans.map((span) => span.fontSize));
  const lineBuckets = [];

  [...workingSpans].sort((a, b) => a.y - b.y || a.x - b.x).forEach((span) => {
    const centerY = span.y + span.height / 2;
    let bestBucket = null;
    let bestDistance = Infinity;
    lineBuckets.forEach((bucket) => {
      const distance = Math.abs(centerY - bucket.centerY);
      const threshold = Math.max(workingMedianFont * 0.72, Math.min(bucket.height, span.height) * 0.8);
      if (distance <= threshold && distance < bestDistance) {
        bestBucket = bucket;
        bestDistance = distance;
      }
    });

    if (!bestBucket) {
      lineBuckets.push({
        centerY,
        height: span.height,
        spans: [span],
      });
      return;
    }

    bestBucket.spans.push(span);
    bestBucket.centerY = median(bestBucket.spans.map((item) => item.y + item.height / 2));
    bestBucket.height = median(bestBucket.spans.map((item) => item.height));
  });

  let lineIndex = 0;
  const workingLines = lineBuckets
    .sort((a, b) => a.centerY - b.centerY)
    .flatMap((bucket) => {
      const ordered = bucket.spans.sort((a, b) => a.x - b.x);
      const runs = splitLineSpansIntoRuns(ordered, workingMedianFont, workingPageWidth);
      const rowText = normalizeText(ordered.map((span) => span.text).join(" "));
      const rowLooksTableLike = isLikelyTableRow(runs, rowText);
      return runs.map((run) => {
        lineIndex += 1;
        return buildLineFromSpans(run, `p${pageNumber}-ocr-l${lineIndex}`, rowLooksTableLike, runs.length);
      });
    });
  const spans = workingSpans.map((span) => mapOcrSpanToViewport(span, viewport, ocrViewport, analysisContext, deskewTransform));
  const lines = workingLines.map((line) => mapOcrLineToViewport(line, viewport, ocrViewport, analysisContext, deskewTransform));
  const medianFont = median(lines.map((line) => line.fontSize));

  if (analysisContext) {
    const samplingContext = {
      lines,
      columns: detectTextColumns(lines, viewport.width, medianFont),
    };
    lines.forEach((line) => {
      const visualStyle = sampleLineVisualStyle(analysisContext, line, medianFont, viewport.width, samplingContext);
      line.backgroundColor = visualStyle.backgroundColor || line.backgroundColor;
      line.textColor = visualStyle.textColor || line.textColor;
      line.sampleBox = visualStyle.sampleBox || line.sampleBox;
      line.sampleBoxes = visualStyle.sampleBoxes || line.sampleBoxes || [];
    });
  }

  return { spans, lines, medianFont };
}

function shouldMergeOcrLineBreak(previousText, nextText) {
  const previous = normalizeText(previousText);
  const next = normalizeText(nextText);
  if (!previous || !next) return false;
  if (/^[a-z(]/.test(next)) return true;
  if (/^(?:O\s*\(|[0-9])/.test(next)) {
    return /\b(the|a|an|of|and|or|to|with|for|in|on|by|from|as|that|which|because|but|it)$/i.test(previous.replace(/[.!?]+$/, ""));
  }
  return false;
}

function normalizeOcrBlockText(lines) {
  const parts = [];
  lines.forEach((line) => {
    const text = normalizeText(line.text);
    if (!text) return;
    if (parts.length && shouldMergeOcrLineBreak(parts[parts.length - 1], text)) {
      parts[parts.length - 1] = parts[parts.length - 1].replace(/[.!?]+$/, "");
    }
    parts.push(text);
  });
  return normalizeText(parts.join(" "));
}

function makeBlockFromLines(lines, id, pageNumber, viewport, medianFont, pageVisualReference) {
  const text = normalizeOcrBlockText(lines);
  const x = Math.min(...lines.map((line) => line.x));
  const y = Math.min(...lines.map((line) => line.y));
  const right = Math.max(...lines.map((line) => line.x + line.width));
  const bottom = Math.max(...lines.map((line) => line.y + line.height));
  const block = {
    id,
    pageNumber,
    fromOcr: true,
    text,
    x,
    y,
    width: right - x,
    height: bottom - y,
    fontSize: median(lines.map((line) => line.fontSize)),
    fontWeight: median(lines.map((line) => line.fontWeight)),
    lineBoxes: lines.map((line) => ({
      x: line.x,
      y: line.y,
      baselineY: median(line.segments.map((segment) => segment.baselineY)),
      width: line.width,
      height: line.height,
      fontSize: line.fontSize,
      fontWeight: line.fontWeight,
      fontFamily: line.fontFamily,
      fontName: line.fontName,
      fontStyle: line.fontStyle,
      fromOcr: true,
      backgroundColor: line.backgroundColor,
      textColor: line.textColor,
      sampleBox: line.sampleBox,
      sampleBoxes: line.sampleBoxes || [],
      text: line.text,
      textLength: line.textLength,
      tableLike: Boolean(line.tableLike),
      rowRunCount: line.rowRunCount || 1,
      segments: line.segments,
    })),
    sourceLines: lines.map((line) => line.text),
    visualReference: pageVisualReference,
  };

  block.spanIds = block.lineBoxes.flatMap((line) => line.segments.map((segment) => segment.id));
  block.tableLike = isLikelyTableBlock(block);
  block.kind = block.tableLike ? "table" : classifyBlock(block, medianFont);
  block.visualDivergence = summarizeBlockVisualDivergence(block, pageVisualReference, medianFont);

  const item = {
    ...block,
    x: Math.max(0, block.x - 2),
    y: Math.max(0, block.y - 2),
    width: Math.min(viewport.width - Math.max(0, block.x - 2), block.width + 6),
    height: block.height + 4,
    textLength: block.text.length,
  };
  item.sourceRejectReason = getSourceBlockRejectReason(item);
  return item;
}

function buildBlocksFromOcrLines(rawLines, viewport, pageNumber, medianFont) {
  const lines = sortLinesForReadingOrder(rawLines, viewport.width, medianFont);
  const pageVisualReference = getLineVisualReference(getPageVisualReferenceLines(lines, viewport.width, medianFont));
  const debugLines = [];
  const blocks = [];
  let current = [];

  const addDebugLine = (line, status, details = {}) => {
    debugLines.push({
      id: line.id,
      status,
      text: line.text,
      x: line.x,
      y: line.y,
      width: line.width,
      height: line.height,
      sampleBox: line.sampleBox,
      sampleBoxes: line.sampleBoxes || [],
      backgroundColor: line.backgroundColor,
      textColor: line.textColor,
      fontSize: line.fontSize,
      fontWeight: line.fontWeight,
      tableLike: Boolean(line.tableLike),
      ...details,
    });
  };

  const flush = () => {
    if (!current.length) return;
    blocks.push(makeBlockFromLines(current, `p${pageNumber}-ocr-b${blocks.length}`, pageNumber, viewport, medianFont, pageVisualReference));
    current = [];
  };

  lines.forEach((line) => {
    const boundaryReasons = getBoundaryLabelReasons(line, medianFont);
    const visualOutlierReasons = getLineVisualOutlierReasons(line, pageVisualReference, medianFont);
    if (line.tableLike || boundaryReasons.length || visualOutlierReasons.length) {
      addDebugLine(line, line.tableLike ? "table" : boundaryReasons.length ? "boundary-label" : "visual-outlier", {
        reasons: [
          ...(line.tableLike ? ["table-row"] : []),
          ...boundaryReasons,
          ...visualOutlierReasons,
        ],
      });
      flush();
      return;
    }

    const previous = current[current.length - 1];
    const gap = previous ? line.y - (previous.y + previous.height) : 999;
    const currentBounds = current.length ? getLineGroupBounds(current) : null;
    const sameColumn = previous ? (
      Math.abs(line.x - previous.x) < medianFont * 5
      || textBlocksOverlap({ x: previous.x, width: previous.width }, { x: line.x, width: line.width }) > 0.28
      || (currentBounds && Math.abs(line.x - currentBounds.x) < medianFont * 5)
    ) : false;
    const danglingContinuation = previous
      && shouldMergeOcrLineBreak(getCurrentBlockText({ lines: current }), line.text)
      && gap <= medianFont * 3.4;
    const paragraphFlow = previous && (sameColumn || danglingContinuation) && gap <= medianFont * 3.4;

    if (!paragraphFlow) flush();
    addDebugLine(line, "kept");
    current.push(line);
  });
  flush();

  const readableBlocks = blocks.filter(isReadableSourceBlock);
  if (readableBlocks.length || countWords(lines.map((line) => line.text).join(" ")) < 40) {
    return { items: blocks, debugLines };
  }

  const bodyLines = lines.filter((line) => (
    !line.tableLike
    && !isBoundaryLabelLine(line, medianFont)
    && !getLineVisualOutlierReasons(line, pageVisualReference, medianFont).length
  ));
  if (countWords(bodyLines.map((line) => line.text).join(" ")) < 40) return { items: blocks, debugLines };

  const fallbackBlock = makeBlockFromLines(bodyLines, `p${pageNumber}-ocr-body`, pageNumber, viewport, medianFont, pageVisualReference);
  return {
    items: [fallbackBlock],
    debugLines: debugLines.map((line) => ({ ...line, fallbackBodyBlock: true })),
  };
}

function extractBlocksFromOcrData(data, viewport, ocrViewport, pageNumber, analysisContext = null, deskewTransform = null) {
  const words = collectOcrWords(data);
  const { spans, lines, medianFont } = buildOcrLinesFromWords(
    words,
    viewport,
    ocrViewport,
    pageNumber,
    analysisContext,
    deskewTransform,
  );
  const { items, debugLines } = buildBlocksFromOcrLines(lines, viewport, pageNumber, medianFont);
  return { items, textSpans: spans, debugLines };
}

async function renderPageToCanvas(page, viewport) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) || canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare PDF page for OCR.");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, ctx };
}

async function runOcrForPdf(pdf) {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (message) => {
      if (message?.status && message.status !== "recognizing text") return;
      if (message?.status === "recognizing text" && Number.isFinite(message.progress)) {
        setStatus(`Running OCR... ${Math.round(message.progress * 100)}%`, 48 + message.progress * 22);
      }
    },
  });

  try {
    const ocrPages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setStatus(`Running OCR on page ${pageNumber} of ${pdf.numPages}...`, 48 + (pageNumber / pdf.numPages) * 24);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.35 });
      const analysisContext = await renderPageAnalysisContext(page, viewport);
      const ocrViewport = page.getViewport({ scale: OCR_RENDER_SCALE });
      const { canvas } = await renderPageToCanvas(page, ocrViewport);
      const deskew = estimateDeskewByProjection(canvas);
      const deskewed = deskew.applied ? deskewCanvasByAngle(canvas, deskew.angle) : null;
      const ocrCanvas = deskewed?.canvas || canvas;
      const result = await worker.recognize(ocrCanvas);
      const pageText = extractBlocksFromOcrData(
        result.data,
        viewport,
        ocrViewport,
        pageNumber,
        analysisContext,
        deskewed,
      );
      ocrPages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        items: pageText.items,
        textSpans: pageText.textSpans,
        debugLines: pageText.debugLines || [],
        extractionMode: "ocr",
        deskew,
      });
    }
    state.pages = ocrPages;
    state.extractionMode = "ocr";
    state.ocrApplied = true;
  } finally {
    await worker.terminate();
  }
}

async function renderPageAnalysisContext(page, viewport) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) || canvas.getContext("2d");
  if (!ctx) return null;

  try {
    await page.render({ canvasContext: ctx, viewport }).promise;
    return ctx;
  } catch (_) {
    return null;
  }
}

async function parsePdf(file) {
  const pdfjsLib = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  state.pdf = pdf;
  state.pages = [];
  state.extractionMode = "text";
  state.ocrApplied = false;
  state.ocrUnavailableReason = "";
  state.ocrSkippedByUser = false;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(`Reading page ${pageNumber} of ${pdf.numPages}...`, 8 + (pageNumber / pdf.numPages) * 34);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
    const textContent = await page.getTextContent();
    const analysisContext = await renderPageAnalysisContext(page, viewport);
    const pageText = extractBlocksFromTextContent(textContent, viewport, pageNumber, analysisContext);
    state.pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      items: pageText.items,
      textSpans: pageText.textSpans,
      debugLines: pageText.debugLines || [],
    });
  }

  const looksScanned = shouldTryOcrForParsedPdf(state.pages, pdf.numPages);
  if (!looksScanned) {
    return { looksScanned: false, ocrApplied: false };
  }

  const shouldRunOcr = await confirmScannedPdf();
  if (!shouldRunOcr) {
    state.ocrSkippedByUser = true;
    return { looksScanned: true, ocrApplied: false, ocrSkippedByUser: true };
  }

  if (pdf.numPages > OCR_MAX_SCANNED_PAGES) {
    state.extractionMode = "scanned-unavailable";
    state.ocrUnavailableReason = "too-many-pages";
    return { looksScanned: true, ocrApplied: false, ocrUnavailableReason: state.ocrUnavailableReason };
  }

  setStatus("This PDF looks scanned. Reading it with OCR...", 46);
  await runOcrForPdf(pdf);
  return { looksScanned: true, ocrApplied: true };
}

function makeDocxLineBoxes(text, x, y, width, fontSize) {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  const averageCharWidth = fontSize * 0.5;
  const maxChars = Math.max(42, Math.floor(width / averageCharWidth));
  const lineHeight = Math.max(22, fontSize * 1.45);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);

  return lines.map((lineText, index) => ({
    x,
    y: y + index * lineHeight,
    baselineY: y + index * lineHeight + fontSize,
    width,
    height: lineHeight,
    fontSize,
    text: lineText,
    textLength: lineText.length,
  }));
}

function getDocxParagraphKind(element, text) {
  const tagName = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tagName)) return "header";
  if (tagName === "li" || hasLeadingListMarkerShape(text)) return "bullet";
  if (isLikelyHeaderBlock(text)) return "header";
  return "paragraph";
}

function parseDocxTable(element) {
  return [...element.querySelectorAll("tr")].map((row) => (
    [...row.querySelectorAll("th,td")].map((cell) => normalizeText(cell.textContent))
  )).filter((row) => row.some(Boolean));
}

function extractDocxElementsFromHtml(html) {
  const parser = new DOMParser();
  const documentHtml = parser.parseFromString(html || "", "text/html");
  const elements = [];

  [...documentHtml.body.children].forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "table") {
      const rows = parseDocxTable(element);
      const text = rows.flat().join(" ");
      if (normalizeText(text)) elements.push({ kind: "table", text, rows });
      return;
    }

    if (tagName === "ul" || tagName === "ol") {
      [...element.querySelectorAll("li")].forEach((item) => {
        const text = normalizeText(item.textContent);
        if (text) elements.push({ kind: "bullet", text });
      });
      return;
    }

    const text = normalizeText(element.textContent);
    if (!text) return;
    elements.push({ kind: getDocxParagraphKind(element, text), text });
  });

  return elements;
}

async function parseDocx(file) {
  const mammoth = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const docxElements = extractDocxElementsFromHtml(result.value);
  const width = 820;
  const marginX = 82;
  const fontSize = 15;
  const sourceWidth = width - marginX * 2;
  let y = 92;

  state.pdf = null;
  state.pages = [{
    pageNumber: 1,
    width,
    height: 1000,
    items: [],
    textSpans: [],
    debugLines: [],
    extractionMode: "docx",
  }];
  state.extractionMode = "docx";
  state.ocrApplied = false;
  state.ocrUnavailableReason = "";
  state.ocrSkippedByUser = false;

  docxElements.forEach((element, index) => {
    const lineBoxes = makeDocxLineBoxes(element.text, marginX, y, sourceWidth, fontSize);
    const height = Math.max(28, lineBoxes.length * Math.max(22, fontSize * 1.45));
    state.pages[0].items.push({
      id: `docx-b${index}`,
      pageNumber: 1,
      kind: element.kind,
      text: element.text,
      x: marginX,
      y,
      width: sourceWidth,
      height,
      fontSize,
      lineBoxes,
      sourceLines: lineBoxes.map((line) => line.text),
      rows: element.rows || null,
      fromDocx: true,
    });
    y += height + (element.kind === "header" ? 14 : 28);
  });

  state.pages[0].height = Math.max(720, y + 80);
  return { looksScanned: false, ocrApplied: false, documentMode: "docx" };
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

function getSourceBlockRejectReason(item) {
  const text = normalizeText(item.text);
  const lines = item.lineBoxes || [];
  const medianFont = Math.max(8, item.fontSize || median(lines.map((line) => line.fontSize)));
  const wordCount = countWords(text);
  const sentenceCount = countSentences(text);
  const ocrParagraphLike = Boolean(item.fromOcr)
    && wordCount >= 40
    && lines.length >= 3
    && wordCount / Math.max(1, lines.length) >= 5;
  if (!text) return "empty";
  if (item.kind === "table" || item.tableLike) return "table-like";
  if (isLikelyHeaderBlock(item)) return "header-like";
  if (isPageNumberText(text)) return "page-number";
  if (hasVisualCalloutStyle(item, medianFont)) return "visual-callout";
  if (isMostlyShortLabelLines(lines)) return "short-label-lines";
  if (sentenceCount < 3 && !ocrParagraphLike) return "too-few-sentences";
  if (wordCount < 40) return "too-few-words";
  if (numericTokenRatio(text) > 0.45) return "numeric-heavy";
  if (!hasReasonableLineSpacing(lines, medianFont)) return "irregular-line-spacing";
  if (!["paragraph", "text", "bullet"].includes(item.kind) && sentenceCount <= 0) return "unsupported-kind";
  return "";
}

function isReadableSourceBlock(item) {
  return !getSourceBlockRejectReason(item);
}

function isDocxSourceCandidate(item) {
  return Boolean(item?.fromDocx)
    && item.kind === "paragraph"
    && countWords(item.text || "") >= 8
    && countSentences(item.text || "") >= 1
    && !isLikelyHeaderBlock(item);
}

function makeDocxSourceBlock(items, index) {
  const text = items.map((item) => item.text).join(" ");
  const lineBoxes = items.flatMap((item) => item.lineBoxes || []);
  const first = items[0];
  const bottom = Math.max(...items.map((item) => (item.y || 0) + (item.height || 0)));
  const right = Math.max(...items.map((item) => (item.x || 0) + (item.width || 0)));
  const left = Math.min(...items.map((item) => item.x || 0));
  return {
    id: `docx-src-${index}`,
    pageNumber: first.pageNumber,
    kind: "paragraph",
    text,
    x: left,
    y: first.y || 0,
    width: Math.max(24, right - left),
    height: Math.max(24, bottom - (first.y || 0)),
    fontSize: first.fontSize || 15,
    lineBoxes,
    sourceLines: lineBoxes.map((line) => line.text),
    sourceElementIds: items.map((item) => item.id),
    fromDocx: true,
    fromDocxSource: true,
  };
}

function getDocxSourceItems() {
  const sourceBlocks = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    const text = current.map((item) => item.text).join(" ");
    if (countWords(text) >= 40 && countSentences(text) >= 3) {
      sourceBlocks.push(makeDocxSourceBlock(current, sourceBlocks.length));
    }
    current = [];
  };

  state.pages.flatMap((page) => page.items).forEach((item) => {
    if (isDocxSourceCandidate(item)) {
      current.push(item);
      return;
    }
    flush();
  });
  flush();
  return sourceBlocks;
}

function getSourceItems() {
  if (state.fileKind === "docx") return getDocxSourceItems();
  return state.pages
    .flatMap((page) => page.items)
    .filter(isReadableSourceBlock);
}

function getSourceItemById() {
  return new Map([
    ...state.pages.flatMap((page) => page.items).map((item) => [item.id, item]),
    ...getSourceItems().map((item) => [item.id, item]),
  ]);
}

function getOriginalDocxElementIdsForAnnotation(annotation, sourceById) {
  const ids = [annotation.anchorItemId, ...coerceIdList(annotation.sourceItemIds)].filter(Boolean);
  const originalIds = [];
  ids.forEach((id) => {
    const item = sourceById.get(id);
    if (Array.isArray(item?.sourceElementIds)) {
      originalIds.push(...item.sourceElementIds);
      return;
    }
    if (item?.fromDocx && !item.fromDocxSource) originalIds.push(item.id);
  });
  return [...new Set(originalIds)];
}

function buildArticlePayload() {
  const sourceBlocks = getSourceItems().map((item, index) => ({
    id: item.id,
    order: index,
    pageNumber: item.pageNumber,
    kind: item.kind,
    fromOcr: Boolean(item.fromOcr),
    sourceLines: item.fromOcr ? (item.sourceLines || item.lineBoxes?.map((line) => line.text) || []) : [],
    text: item.text,
  }));

  return {
    title: getDocumentTitle(),
    articles: [{
      articleId: `${state.fileKind || "document"}-article-1`,
      title: getDocumentTitle(),
      sourceBlocks,
    }],
  };
}

function coerceIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((id) => String(id)).filter(Boolean);
}

function findSourceIdsForText(sourceText, allowedIds = []) {
  const sourceById = getSourceItemById();
  const candidates = allowedIds.length ? allowedIds.map((id) => sourceById.get(id)).filter(Boolean) : getSourceItems();
  const normalizedNeedle = normalizeForMatch(sourceText);
  if (!normalizedNeedle) return [];

  const direct = candidates.find((item) => normalizeForMatch(item.text).includes(normalizedNeedle));
  if (direct) return [direct.id];

  const sourceWords = new Set(normalizedNeedle.split(/\s+/).filter((word) => word.length > 3));
  let best = null;
  let bestScore = 0;
  candidates.forEach((item) => {
    const words = normalizeForMatch(item.text).split(/\s+/);
    const overlap = words.filter((word) => sourceWords.has(word)).length;
    const score = overlap / Math.max(1, sourceWords.size);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  });

  return best && bestScore >= 0.35 ? [best.id] : [];
}

function getFirstSourceItem(ids, fallbackText = "") {
  const sourceById = getSourceItemById();
  const validIds = coerceIdList(ids).filter((id) => sourceById.has(id));
  if (validIds.length) return sourceById.get(validIds[0]);
  const matchedIds = findSourceIdsForText(fallbackText);
  return matchedIds.length ? sourceById.get(matchedIds[0]) : null;
}

function annotationFromPlan(item, kind, label, originalText, index, sourceItemIds = [item.id], metadata = {}) {
  const lineHeight = Math.max(20, item.fontSize * 1.55);
  const x = kind === "bullet" ? item.x + Math.max(12, item.fontSize) : item.x;
  return {
    pageNumber: item.pageNumber,
    sourceItemIds: coerceIdList(sourceItemIds).length ? coerceIdList(sourceItemIds) : [item.id],
    anchorItemId: item.id,
    sectionId: metadata.sectionId || null,
    kind,
    label: normalizeText(label).slice(0, 90),
    originalText: kind === "bullet" ? normalizeText(originalText || item.text) : "",
    x,
    y: item.y + index * lineHeight,
    width: Math.max(24, item.width - (kind === "bullet" ? Math.max(12, item.fontSize) : 0)),
    height: lineHeight,
  };
}

function annotationsFromStructuredSummary(data) {
  const annotations = [];
  const rowBySource = new Map();
  const nextRow = (itemId) => {
    const row = rowBySource.get(itemId) || 0;
    rowBySource.set(itemId, row + 1);
    return row;
  };

  (data.articles || []).forEach((article) => {
    (article.sections || []).forEach((section, sectionIndex) => {
      const sectionId = String(section.sectionId || section.id || `${article.articleId}-s${sectionIndex + 1}`);
      const sectionBlocks = section.blocks || [];
      const firstBlock = sectionBlocks.find((block) => coerceIdList(block.sourceBlockIds).length || block.sourceText);
      const headerItem = getFirstSourceItem(section.sourceBlockIds, section.sourceText) || getFirstSourceItem(firstBlock?.sourceBlockIds, firstBlock?.sourceText);
      if (headerItem && section.title) {
        annotations.push(annotationFromPlan(headerItem, "header", section.title, "", nextRow(headerItem.id), [headerItem.id], { sectionId }));
      }

      sectionBlocks.forEach((block) => {
        const sourceIds = coerceIdList(block.sourceBlockIds);
        const matchedIds = sourceIds.length ? sourceIds : findSourceIdsForText(block.sourceText, coerceIdList(section.sourceBlockIds));
        const item = getFirstSourceItem(matchedIds, block.sourceText);
        if (!item || !block.bullet) return;
        annotations.push(annotationFromPlan(item, "bullet", block.bullet, block.sourceText || item.text, nextRow(item.id), matchedIds.length ? matchedIds : [item.id], { sectionId }));
      });
    });
  });

  return annotations;
}

async function summarizeDocument() {
  const articlePayload = buildArticlePayload();
  if (!articlePayload.articles[0].sourceBlocks.length) {
    throw new Error("This document does not contain enough long-form text to summarize.");
  }

  setStatus(`Asking ${state.selectedModel} to structure the document...`, 62);
  const response = await fetch(`${API_BASE}/fn/summarize-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: state.file.name,
      title: getDocumentTitle(),
      fileObjectId: state.objectId,
      model: state.selectedModel,
      articles: articlePayload.articles,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!response.ok) throw new Error("Summarization failed");
  state.summaryData = data;
  state.annotations = annotationsFromStructuredSummary(data);
  if (!state.annotations.length) {
    throw new Error("The model returned no usable source-linked annotations.");
  }
  els.docTitle.textContent = data.document?.title || state.file.name;
  els.docSubtitle.textContent = `${data.stats?.sections || 0} sections and ${data.stats?.blocks || state.annotations.length} content blocks transformed into clickable notes.`;
}

function getAnnotationsBySource(pageAnnotations) {
  const annotationsBySource = new Map();
  pageAnnotations.forEach((annotation) => {
    const sourceId = annotation.anchorItemId || coerceIdList(annotation.sourceItemIds)[0];
    if (!sourceId) return;
    if (!annotationsBySource.has(sourceId)) annotationsBySource.set(sourceId, []);
    annotationsBySource.get(sourceId).push(annotation);
  });
  return annotationsBySource;
}

function getSourceReplacements(pageData, pageAnnotations) {
  const annotationsBySource = getAnnotationsBySource(pageAnnotations);

  return pageData.items
    .filter((item) => annotationsBySource.has(item.id))
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
  const sourceById = new Map(pageData.items.map((item) => [item.id, item]));
  pageAnnotations.forEach((annotation) => {
    coerceIdList(annotation.sourceItemIds).forEach((sourceId) => {
      const source = sourceById.get(sourceId);
      if (!source) return;
      getSourceSpanIds(source).forEach((spanId) => skipped.add(spanId));
    });
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

function colorToCss(color) {
  return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}

function parseHexColor(hex) {
  const normalized = String(hex || "").replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  return {
    red: parseInt(value.slice(0, 2), 16),
    green: parseInt(value.slice(2, 4), 16),
    blue: parseInt(value.slice(4, 6), 16),
  };
}

function getRelativeLuminance(color) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue);
}

function getContrastRatio(colorA, colorB) {
  const luminanceA = getRelativeLuminance(colorA);
  const luminanceB = getRelativeLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function getColorDistance(colorA, colorB) {
  return Math.hypot(colorA.red - colorB.red, colorA.green - colorB.green, colorA.blue - colorB.blue);
}

function pickReadableColor(background, palette, avoidHex = null) {
  const avoidColor = avoidHex ? parseHexColor(avoidHex) : null;
  const scored = palette.map((hex, index) => {
    const color = parseHexColor(hex);
    const contrast = getContrastRatio(color, background);
    const distanceFromAvoid = avoidColor ? getColorDistance(color, avoidColor) : 120;
    return {
      hex,
      contrast,
      distanceFromAvoid,
      score: contrast * 12 + Math.min(distanceFromAvoid, 180) / 18 - index * 0.35,
    };
  });

  const preferred = scored.find((candidate) => (
    candidate.contrast >= MIN_TEXT_CONTRAST
    && (!avoidColor || candidate.distanceFromAvoid >= 72)
  ));
  if (preferred) return preferred.hex;
  return scored.sort((a, b) => b.score - a.score)[0]?.hex || palette[0];
}

function getReplacementColors(background) {
  const header = pickReadableColor(background, HEADER_COLOR_PALETTE);
  const bullet = pickReadableColor(background, BULLET_COLOR_PALETTE, header);
  return { header, bullet };
}

function getDominantBackgroundColorFromPixels(pixels) {
  const buckets = new Map();
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];

    const key = [
      Math.round(red / 10) * 10,
      Math.round(green / 10) * 10,
      Math.round(blue / 10) * 10,
    ].join(",");
    const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return { red: 255, green: 255, blue: 255 };
  return {
    red: Math.round(dominant.red / dominant.count),
    green: Math.round(dominant.green / dominant.count),
    blue: Math.round(dominant.blue / dominant.count),
  };
}

function getSourceSegmentRects(ctx, pageData, source) {
  const spanById = new Map((pageData.textSpans || []).map((span) => [span.id, span]));
  const sourceSpanIds = getSourceSpanIds(source);
  const spans = sourceSpanIds.map((spanId) => spanById.get(spanId)).filter(Boolean);
  if (spans.length) {
    return spans.map((span) => ({
      x: span.x,
      y: span.y,
      width: Math.max(span.width || 0, 4),
      height: Math.max(span.height || 0, Math.max(8, span.fontSize || 12) * 1.25),
      fontSize: span.fontSize,
    }));
  }

  const lineSegments = getSourceLines(source).flatMap((line) => line.segments || []);
  if (lineSegments.length) {
    return lineSegments.map((segment) => ({
      x: segment.x,
      y: segment.y,
      width: Math.max(segment.width || 0, (segment.textLength || (segment.text || "").length) * Math.max(8, segment.fontSize || 12) * 0.48, 4),
      height: Math.max(segment.height || 0, Math.max(8, segment.fontSize || 12) * 1.25),
      fontSize: segment.fontSize,
    }));
  }

  const lines = getSourceLines(source);
  if (lines.length) {
    return lines.map((line) => ({
      x: line.x,
      y: line.y,
      width: Math.max(line.width || 0, getLineTextWidth(ctx, line), 4),
      height: Math.max(line.height || 0, Math.max(8, line.fontSize || source.fontSize || 12) * 1.25),
      fontSize: line.fontSize || source.fontSize,
    }));
  }

  return [{
    x: source.x,
    y: source.y,
    width: Math.max(source.width || 0, 4),
    height: Math.max(source.height || 0, Math.max(8, source.fontSize || 12) * 1.25),
    fontSize: source.fontSize,
  }];
}

function clampRectToPage(rect, pageData) {
  const x = Math.max(0, Math.min(pageData.width, rect.x));
  const y = Math.max(0, Math.min(pageData.height, rect.y));
  const right = Math.max(x, Math.min(pageData.width, rect.x + rect.width));
  const bottom = Math.max(y, Math.min(pageData.height, rect.y + rect.height));
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function sampleRegionBackground(ctx, region) {
  const sampleX = Math.max(0, Math.floor(region.x));
  const sampleY = Math.max(0, Math.floor(region.y));
  const sampleWidth = Math.min(ctx.canvas.width - sampleX, Math.max(1, Math.ceil(region.width)));
  const sampleHeight = Math.min(ctx.canvas.height - sampleY, Math.max(1, Math.ceil(region.height)));
  if (sampleWidth <= 0 || sampleHeight <= 0) return { red: 255, green: 255, blue: 255 };

  try {
    return getDominantBackgroundColorFromPixels(ctx.getImageData(sampleX, sampleY, sampleWidth, sampleHeight).data);
  } catch (_) {
    return { red: 255, green: 255, blue: 255 };
  }
}

function getSourceRegion(ctx, pageData, source) {
  const rects = getSourceSegmentRects(ctx, pageData, source);
  const debugRects = rects.map((rect) => clampRectToPage(rect, pageData));
  const fontSize = Math.max(8, median(rects.map((rect) => rect.fontSize || rect.height || source.fontSize || 12)));
  const padX = Math.max(2, fontSize * 0.16);
  const padTop = Math.max(2, fontSize * 0.2);
  const padBottom = Math.max(3, fontSize * 0.32);
  const rawRegion = {
    x: Math.min(...rects.map((rect) => rect.x)) - padX,
    y: Math.min(...rects.map((rect) => rect.y)) - padTop,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - Math.min(...rects.map((rect) => rect.x)) + padX * 2,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - Math.min(...rects.map((rect) => rect.y)) + padTop + padBottom,
  };
  const region = clampRectToPage(rawRegion, pageData);
  const background = sampleRegionBackground(ctx, region);
  return {
    ...region,
    id: source.id,
    background,
    colors: getReplacementColors(background),
    debugRects,
  };
}

function clearSourceRegion(ctx, region) {
  ctx.save();
  if (DEBUG_SOURCE_REGION_OVERLAY) {
    ctx.fillStyle = "rgba(250, 204, 21, 0.42)";
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 2;
    ctx.fillRect(region.x, region.y, region.width, region.height);
    ctx.strokeRect(region.x, region.y, region.width, region.height);
    if (DEBUG_SOURCE_SEGMENT_RECTS && region.debugRects?.length) {
      const maxRight = Math.max(...region.debugRects.map((rect) => rect.x + rect.width));
      const maxBottom = Math.max(...region.debugRects.map((rect) => rect.y + rect.height));
      region.debugRects.forEach((rect) => {
        const drivesRight = Math.abs(rect.x + rect.width - maxRight) <= 0.75;
        const drivesBottom = Math.abs(rect.y + rect.height - maxBottom) <= 0.75;
        ctx.fillStyle = drivesRight || drivesBottom ? "rgba(236, 72, 153, 0.16)" : "rgba(239, 68, 68, 0.08)";
        ctx.strokeStyle = drivesBottom ? "#db2777" : drivesRight ? "#16a34a" : "#dc2626";
        ctx.lineWidth = drivesRight || drivesBottom ? 2 : 1;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      });
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = colorToCss(region.background);
  ctx.fillRect(region.x, region.y, region.width, region.height);
  ctx.restore();
}

function clearReplacementRegions(ctx, annotations) {
  const cleared = new Set();
  annotations.forEach((annotation) => {
    const region = annotation.sourceRegion;
    if (!region || cleared.has(region.id)) return;
    cleared.add(region.id);
    clearSourceRegion(ctx, region);
  });
}

function getVisualDebugStyle(status) {
  const styles = {
    kept: { stroke: "#16a34a", fill: "rgba(34, 197, 94, 0.12)" },
    table: { stroke: "#64748b", fill: "rgba(100, 116, 139, 0.10)" },
    "boundary-label": { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.14)" },
    "visual-outlier": { stroke: "#db2777", fill: "rgba(219, 39, 119, 0.14)" },
    "visual-boundary": { stroke: "#7c3aed", fill: "rgba(124, 58, 237, 0.14)" },
  };
  return styles[status] || { stroke: "#2563eb", fill: "rgba(37, 99, 235, 0.12)" };
}

function colorWithAlpha(color, alpha) {
  if (!color) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
}

function drawDebugRect(ctx, rect, pageData, fillStyle, strokeStyle, lineWidth = 1, dash = []) {
  if (!rect) return;
  const clamped = clampRectToPage(rect, pageData);
  ctx.save();
  ctx.setLineDash(dash);
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.fillRect(clamped.x, clamped.y, clamped.width, clamped.height);
  ctx.strokeRect(clamped.x, clamped.y, clamped.width, clamped.height);
  ctx.restore();
}

function drawVisualDebugLegend(ctx) {
  const entries = [
    ["kept", "kept"],
    ["boundary-label", "label/header"],
    ["visual-outlier", "visual outlier"],
    ["visual-boundary", "new visual block"],
    ["table", "table"],
  ];
  const x = 14;
  const y = 14;
  const rowHeight = 16;

  ctx.save();
  ctx.font = getCanvasFont(400, 10);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.strokeStyle = "rgba(15, 23, 42, 0.2)";
  ctx.lineWidth = 1;
  ctx.fillRect(x - 8, y - 8, 138, entries.length * rowHeight + 12);
  ctx.strokeRect(x - 8, y - 8, 138, entries.length * rowHeight + 12);

  entries.forEach(([status, label], index) => {
    const style = getVisualDebugStyle(status);
    const rowY = y + index * rowHeight;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = style.stroke;
    ctx.fillRect(x, rowY - 5, 10, 10);
    ctx.strokeRect(x, rowY - 5, 10, 10);
    ctx.fillStyle = "#0f172a";
    ctx.fillText(label, x + 16, rowY);
  });
  ctx.restore();
}

function drawVisualSamplingDebug(ctx, pageData) {
  if (!DEBUG_VISUAL_SAMPLING_BANDS || !pageData.debugLines?.length) return;

  ctx.save();
  pageData.debugLines.forEach((line) => {
    const style = getVisualDebugStyle(line.status);
    const sampleBand = line.sampleBox || {
      x: line.x,
      y: line.y,
      width: line.width,
      height: line.height,
    };
    const dash = line.status === "kept" ? [] : [4, 3];

    drawDebugRect(ctx, sampleBand, pageData, colorWithAlpha(line.backgroundColor, 0.2), style.stroke, 1.5, dash);
    drawDebugRect(ctx, line, pageData, style.fill, "rgba(15, 23, 42, 0.45)", 0.75, [2, 3]);

    if (DEBUG_VISUAL_SPAN_SAMPLE_BOXES && line.sampleBoxes?.length) {
      line.sampleBoxes.forEach((sampleBox) => {
        drawDebugRect(ctx, sampleBox, pageData, "rgba(6, 182, 212, 0.08)", "rgba(8, 145, 178, 0.9)", 0.75);
      });
    }
  });
  drawVisualDebugLegend(ctx);
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

function getLayoutMeasureContext() {
  if (!getLayoutMeasureContext.ctx) {
    const canvas = document.createElement("canvas");
    getLayoutMeasureContext.ctx = canvas.getContext("2d");
  }
  return getLayoutMeasureContext.ctx;
}

function getAnnotationLabelWidth(annotation, fontSize) {
  const ctx = getLayoutMeasureContext();
  if (!ctx) return getCanvasLabel(annotation).length * fontSize * 0.58;
  ctx.font = getCanvasFont(650, fontSize);
  return ctx.measureText(getCanvasLabel(annotation)).width;
}

function canShareBulletRow(first, second, slotWidth, fontSize) {
  if (!first || !second) return false;
  if (first.kind !== "bullet" || second.kind !== "bullet") return false;
  if (!first.sectionId || first.sectionId !== second.sectionId) return false;
  const maxLabelWidth = Math.max(24, slotWidth - 8);
  return getAnnotationLabelWidth(first, fontSize) <= maxLabelWidth
    && getAnnotationLabelWidth(second, fontSize) <= maxLabelWidth;
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

function layoutReplacementAnnotations(pageData, pageAnnotations, ctx = null) {
  const replacements = getSourceReplacements(pageData, pageAnnotations);
  const positioned = [];
  const replacedAnnotations = new Set();
  const sourceById = new Map(pageData.items.map((item) => [item.id, item]));
  const readingFontScale = getReadingFontScale();
  const readingLineScale = getReadingLineHeight() / (DEFAULT_READING_SETTINGS.lineDistance / 100);
  const headerTextColor = getColorValue(state.headerColor, COLOR_OPTIONS.blue);
  const bulletTextColor = getColorValue(state.bulletColor, COLOR_OPTIONS.rose);

  replacements.forEach(({ source, annotations }) => {
    const lines = getSourceLines(source);
    const orderedAnnotations = [...annotations].sort((a, b) => a.y - b.y || a.x - b.x);
    const lineHeight = median(lines.map((line) => line.height));
    const fontSize = Math.max(11, source.fontSize || median(lines.map((line) => line.fontSize)));
    const sourceRegion = ctx ? getSourceRegion(ctx, pageData, source) : {
      id: source.id,
      x: source.x,
      y: source.y,
      width: source.width,
      height: source.height,
      background: { red: 255, green: 255, blue: 255 },
      colors: getReplacementColors({ red: 255, green: 255, blue: 255 }),
    };
    const regionPadding = Math.max(2, fontSize * 0.22);
    const regionLeft = sourceRegion.x + regionPadding;
    const regionRight = sourceRegion.x + sourceRegion.width - regionPadding;
    const regionTop = sourceRegion.y + regionPadding;
    const regionHeight = Math.max(12, sourceRegion.height - regionPadding * 2);
    const baseAnnotationLineHeight = Math.max(22, lineHeight, fontSize * 1.65 * readingLineScale);
    const baseBulletFontSize = Math.max(12, fontSize * 0.96 * readingFontScale);
    const baseHeaderFontSize = Math.max(14, fontSize * 1.08 * readingFontScale);
    const replacementRows = [];

    for (let index = 0; index < orderedAnnotations.length; index += 1) {
      const annotation = orderedAnnotations[index];
      const nextAnnotation = orderedAnnotations[index + 1];
      const bulletFontSize = baseBulletFontSize;
      const textAreaWidth = Math.max(24, regionRight - regionLeft);
      const halfSlotWidth = Math.max(24, textAreaWidth / 2 - Math.max(10, fontSize * 0.9) - 8);
      if (canShareBulletRow(annotation, nextAnnotation, halfSlotWidth, bulletFontSize)) {
        replacementRows.push([annotation, nextAnnotation]);
        index += 1;
      } else {
        replacementRows.push([annotation]);
      }
    }

    const rowHeight = Math.max(
      11,
      Math.min(baseAnnotationLineHeight, regionHeight / Math.max(1, replacementRows.length)),
    );

    replacementRows.forEach((row, rowIndex) => {
      const line = lines[rowIndex] || {
        x: regionLeft,
        y: regionTop + rowIndex * rowHeight,
        width: source.width,
        height: rowHeight,
        fontSize,
        text: "",
        textLength: 0,
      };
      const y = regionTop + rowIndex * rowHeight;
      const rightEdge = Math.max(regionLeft + 24, regionRight);

      row.forEach((annotation, rowItemIndex) => {
        replacedAnnotations.add(annotation);
        const isPairedBullet = row.length === 2 && annotation.kind === "bullet";
        const fittedFontSize = annotation.kind === "header"
          ? Math.max(9, Math.min(baseHeaderFontSize, rowHeight * 0.72))
          : Math.max(8, Math.min(baseBulletFontSize, rowHeight * 0.64));
        const indent = annotation.kind === "bullet" ? Math.max(8, fittedFontSize * 0.85) : 0;
        const noisyOcrLineStart = source.fromOcr
          && (annotation.kind === "header" || Math.abs((line.x || regionLeft) - regionLeft) > Math.max(fontSize * 8, sourceRegion.width * 0.28));
        const lineX = noisyOcrLineStart
          ? regionLeft
          : Math.max(regionLeft, Math.min(line.x || regionLeft, rightEdge - 24));
        const rowX = Math.max(regionLeft, Math.min(lineX + indent, rightEdge - 24));
        const centerX = regionLeft + Math.max(24, rightEdge - regionLeft) / 2;
        const x = isPairedBullet && rowItemIndex === 1 ? Math.max(centerX, rowX) : rowX;
        const maxAvailableWidth = Math.max(24, rightEdge - x);
        const availableWidth = isPairedBullet
          ? Math.max(24, Math.min(maxAvailableWidth, (rowItemIndex === 0 ? centerX : rightEdge) - x - 8))
          : maxAvailableWidth;
        positioned.push({
          ...annotation,
          x,
          y,
          width: Math.max(24, availableWidth),
          height: Math.max(10, rowHeight),
          fontSize: fittedFontSize,
          replacementText: getFixedLengthReplacement(annotation, line.text || source.text),
          sourceRegion,
          textColor: annotation.kind === "header" ? headerTextColor : bulletTextColor,
        });
      });
    });
  });

  const clearedRegionIds = new Set(positioned.map((annotation) => annotation.sourceRegion?.id).filter(Boolean));
  pageAnnotations.forEach((annotation) => {
    coerceIdList(annotation.sourceItemIds).forEach((sourceId) => {
      if (clearedRegionIds.has(sourceId)) return;
      const source = sourceById.get(sourceId);
      if (!source) return;
      const sourceRegion = ctx ? getSourceRegion(ctx, pageData, source) : {
        id: source.id,
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
        background: { red: 255, green: 255, blue: 255 },
        colors: getReplacementColors({ red: 255, green: 255, blue: 255 }),
      };
      positioned.push({
        pageNumber: source.pageNumber,
        sourceItemIds: [source.id],
        anchorItemId: source.id,
        kind: "clear",
        label: "",
        originalText: "",
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
        sourceRegion,
        clearOnly: true,
      });
      clearedRegionIds.add(sourceId);
    });
  });

  pageAnnotations.forEach((annotation) => {
    if (!replacedAnnotations.has(annotation)) {
      positioned.push({
        ...annotation,
        fontSize: (annotation.kind === "header" ? 15 : 13) * readingFontScale,
        replacementText: getFixedLengthReplacement(annotation, annotation.originalText || ""),
      });
    }
  });

  return positioned;
}

function drawReplacementText(ctx, annotation) {
  if (annotation.clearOnly) return;
  const label = (annotation.replacementText || getCanvasLabel(annotation)).trimEnd();
  let fontSize = annotation.fontSize || (annotation.kind === "header" ? 15 : 13);
  const weight = annotation.kind === "header" ? 800 : 650;
  const color = annotation.textColor || (annotation.kind === "header" ? getColorValue(state.headerColor, COLOR_OPTIONS.blue) : getColorValue(state.bulletColor, COLOR_OPTIONS.rose));

  ctx.save();
  if (annotation.sourceRegion) {
    ctx.beginPath();
    ctx.rect(
      annotation.sourceRegion.x,
      annotation.sourceRegion.y,
      annotation.sourceRegion.width,
      annotation.sourceRegion.height,
    );
    ctx.clip();
  }
  ctx.fillStyle = color;
  ctx.font = getCanvasFont(weight, fontSize);
  while (fontSize > 8 && ctx.measureText(label).width > annotation.width) {
    fontSize -= 0.5;
    ctx.font = getCanvasFont(weight, fontSize);
  }
  const baseline = annotation.y + Math.min(Math.max(fontSize + 2, annotation.height * 0.78), annotation.height - 2);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, annotation.x, baseline, annotation.width);
  ctx.restore();
}

function drawReplacementTexts(ctx, annotations) {
  annotations.forEach((annotation) => drawReplacementText(ctx, annotation));
}

async function renderPdfPages() {
  await loadSelectedFont();
  const pdf = state.pdf;
  closeVisiblePopovers();
  if (state.customizingPopoverKey) exitPopoverCustomization();
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
    const positionedAnnotations = layoutReplacementAnnotations(pageData, pageAnnotations, canvasContext);
    clearReplacementRegions(canvasContext, positionedAnnotations);
    drawReplacementTexts(canvasContext, positionedAnnotations);
    drawVisualSamplingDebug(canvasContext, pageData);
    pageEl.appendChild(canvas);

    positionedAnnotations.forEach((annotation) => {
      const annotationButton = createAnnotation(annotation);
      if (annotationButton) pageEl.appendChild(annotationButton);
    });

    els.pages.appendChild(pageEl);
  }
  setStatus("Presentation ready.", 100);
}

function renderDocumentView() {
  closeVisiblePopovers();
  if (state.customizingPopoverKey) exitPopoverCustomization();
  els.pages.innerHTML = "";

  const documentEl = document.createElement("article");
  documentEl.className = "document-view";
  documentEl.style.transform = `scale(${state.scale})`;

  const sourceById = getSourceItemById();
  const annotationsByElement = new Map();
  const consumedElementIds = new Set();
  state.annotations.forEach((annotation) => {
    const originalIds = getOriginalDocxElementIdsForAnnotation(annotation, sourceById);
    const anchorId = originalIds[0] || annotation.anchorItemId;
    if (!anchorId) return;
    if (!annotationsByElement.has(anchorId)) annotationsByElement.set(anchorId, []);
    annotationsByElement.get(anchorId).push(annotation);
    originalIds.forEach((id) => consumedElementIds.add(id));
  });

  const renderReplacement = (annotations) => {
    const replacement = document.createElement("section");
    replacement.className = "doc-section doc-replacement";
    annotations
      .filter((annotation) => annotation.kind !== "clear")
      .sort((a, b) => a.y - b.y || (a.kind === "header" ? -1 : 1) - (b.kind === "header" ? -1 : 1))
      .forEach((annotation) => {
        if (annotation.kind === "header") {
          const heading = document.createElement("h3");
          heading.textContent = annotation.label || "Section";
          replacement.appendChild(heading);
          return;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "doc-note";
        button.dataset.popoverKey = getAnnotationPopoverKey(annotation);
        button.setAttribute("aria-label", `Show original text for ${annotation.label}`);

        const bullet = document.createElement("span");
        bullet.className = "doc-note-marker";
        bullet.textContent = "\u2022";

        const label = document.createElement("span");
        label.textContent = annotation.label || "Summary point";

        button.append(bullet, label);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          showPopover(button, annotation.originalText || "");
        });
        replacement.appendChild(button);
      });
    return replacement;
  };

  const renderOriginal = (item) => {
    if (item.kind === "table" && item.rows?.length) {
      const table = document.createElement("table");
      table.className = "doc-original-table";
      item.rows.forEach((row) => {
        const rowEl = document.createElement("tr");
        row.forEach((cell) => {
          const cellEl = document.createElement("td");
          cellEl.textContent = cell;
          rowEl.appendChild(cellEl);
        });
        table.appendChild(rowEl);
      });
      return table;
    }

    const element = document.createElement(item.kind === "header" ? "h2" : "p");
    element.className = `doc-original doc-original-${item.kind}`;
    element.textContent = item.text;
    return element;
  };

  state.pages.flatMap((page) => page.items).forEach((item) => {
    const anchoredAnnotations = annotationsByElement.get(item.id) || [];
    if (anchoredAnnotations.length) {
      documentEl.appendChild(renderReplacement(anchoredAnnotations));
      return;
    }
    if (consumedElementIds.has(item.id)) return;
    documentEl.appendChild(renderOriginal(item));
  });

  els.pages.appendChild(documentEl);
  setStatus("Document ready.", 100);
}

function createAnnotation(annotation) {
  if (!annotation.originalText) return null;

  const button = document.createElement("button");
  button.className = `annotation ${annotation.kind}`;
  button.type = "button";
  button.dataset.popoverKey = getAnnotationPopoverKey(annotation);
  button.setAttribute("aria-label", `Show original text for ${annotation.label}`);
  button.title = annotation.label;
  button.style.left = `${annotation.x}px`;
  button.style.top = `${annotation.y}px`;
  button.style.width = `${annotation.width}px`;
  button.style.height = `${Math.max(20, annotation.height)}px`;
  if (annotation.kind === "bullet") {
    const fontSize = annotation.fontSize || 13;
    const ctx = getLayoutMeasureContext();
    if (ctx) {
      ctx.font = getCanvasFont(650, fontSize);
      button.dataset.connectorOffsetX = String(Math.max(2, ctx.measureText("\u2022").width / 2));
    }
    button.dataset.connectorOffsetY = String(Math.max(10, Math.max(20, annotation.height) / 2));
  }
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    showPopover(button, annotation.originalText);
  });
  return button;
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getAnnotationPopoverKey(annotation) {
  const sourceIds = coerceIdList(annotation.sourceItemIds).join("|");
  return `source-${hashString(`${annotation.kind}|${sourceIds}|${annotation.label}|${annotation.originalText}`)}`;
}

function getAnchorPopoverKey(anchor) {
  if (!anchor.dataset.popoverKey) {
    anchor.dataset.popoverKey = `popover-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
  }
  return anchor.dataset.popoverKey;
}

function getPopoverContainer(anchor) {
  return document.body;
}

function getAnchorScale(anchor) {
  const width = anchor.offsetWidth || 1;
  const rectWidth = anchor.getBoundingClientRect().width || width;
  return rectWidth / width || 1;
}

function getAnchorPoint(anchor) {
  const scale = getAnchorScale(anchor);
  const anchorRect = anchor.getBoundingClientRect();
  const marker = anchor.querySelector?.(".doc-note-marker");
  if (marker) {
    const markerRect = marker.getBoundingClientRect();
    return {
      x: markerRect.left + markerRect.width / 2,
      y: markerRect.top + markerRect.height / 2,
      width: 0,
      height: 0,
    };
  }
  const offsetX = Number(anchor.dataset.connectorOffsetX);
  const offsetY = Number(anchor.dataset.connectorOffsetY);
  if (Number.isFinite(offsetX) || Number.isFinite(offsetY)) {
    return {
      x: anchorRect.left + (Number.isFinite(offsetX) ? offsetX * scale : 0),
      y: anchorRect.top + (Number.isFinite(offsetY) ? offsetY * scale : anchorRect.height / 2),
      width: 0,
      height: 0,
    };
  }
  return {
    x: anchorRect.left,
    y: anchorRect.top,
    width: anchorRect.width,
    height: anchorRect.height,
  };
}

function closePopover(popover) {
  const key = popover.dataset.popoverKey;
  if (state.customizingPopoverKey === key) exitPopoverCustomization();
  popover.resizeObserver?.disconnect?.();
  if (key) {
    document.querySelector(`.popover-connector[data-popover-key="${CSS.escape(key)}"]`)?.remove();
  }
  popover.remove();
}

function updatePopoverConnector(anchor, popover, connector) {
  const anchorPoint = getAnchorPoint(anchor);
  const startX = anchorPoint.x;
  const startY = anchorPoint.y + anchorPoint.height / 2;
  const popoverLeft = Number.parseFloat(popover.style.left) || 0;
  const popoverTop = Number.parseFloat(popover.style.top) || 0;
  const endX = popoverLeft + 18;
  const endY = popoverTop + 18;
  const width = Math.hypot(endX - startX, endY - startY);
  const angle = Math.atan2(endY - startY, endX - startX);

  connector.style.left = `${startX}px`;
  connector.style.top = `${startY}px`;
  connector.style.width = `${width}px`;
  connector.style.transform = `rotate(${angle}rad)`;
}

function makePopoverDraggable(anchor, popover, connector) {
  const handle = popover.querySelector(".source-popover-header");
  if (!handle) return;

  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".close-popover, .customize-popover")) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = Number.parseFloat(popover.style.left) || 0;
    const startTop = Number.parseFloat(popover.style.top) || 0;

    handle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent) => {
      const nextLeft = startLeft + (moveEvent.clientX - startX);
      const nextTop = startTop + (moveEvent.clientY - startY);
      popover.style.left = `${nextLeft}px`;
      popover.style.top = `${nextTop}px`;
      updatePopoverConnector(anchor, popover, connector);
    };

    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  });
}

function applyPopoverReadingSettings(popover) {
  const key = popover.dataset.popoverKey;
  const settings = key ? getPopoverSettings(key) : null;
  if (!settings) {
    popover.style.fontFamily = "";
    popover.style.removeProperty("--popover-font-scale");
    popover.style.removeProperty("--popover-line-height");
    return;
  }

  const option = getFontOption(settings.font);
  popover.style.fontFamily = option.css;
  popover.style.setProperty("--popover-font-scale", String(getReadingFontScale(settings)));
  popover.style.setProperty("--popover-line-height", String(getReadingLineHeight(settings)));
}

function getPopoverElementByKey(key) {
  if (!key) return null;
  return document.querySelector(`.source-popover[data-popover-key="${CSS.escape(key)}"]`);
}

function updatePopoverCustomizeButtons() {
  document.querySelectorAll(".customize-popover").forEach((button) => {
    const popover = button.closest(".source-popover");
    button.classList.toggle("active", Boolean(popover?.dataset.popoverKey && popover.dataset.popoverKey === state.customizingPopoverKey));
  });
}

function enterPopoverCustomization(popover) {
  const key = popover.dataset.popoverKey;
  if (!key) return;
  state.customizingPopoverKey = key;
  if (!state.popoverSettings[key]) {
    state.popoverSettings[key] = getGlobalReadingSettings();
  }
  els.readingSettingsPanel?.classList.add("customizing");
  if (els.settingsModeLabel) els.settingsModeLabel.textContent = "Text window settings";
  if (els.settingsDoneButton) els.settingsDoneButton.hidden = false;
  syncSettingsControls();
  updatePopoverCustomizeButtons();
}

function exitPopoverCustomization() {
  state.customizingPopoverKey = "";
  els.readingSettingsPanel?.classList.remove("customizing");
  if (els.settingsModeLabel) els.settingsModeLabel.textContent = "Reading settings";
  if (els.settingsDoneButton) els.settingsDoneButton.hidden = true;
  syncSettingsControls();
  updatePopoverCustomizeButtons();
}

function updateLocalPopoverSettings(partial) {
  const key = state.customizingPopoverKey;
  if (!key) return;
  const current = getPopoverSettings(key) || getGlobalReadingSettings();
  const next = {
    font: partial.font && FONT_OPTIONS[partial.font] ? partial.font : current.font,
    textSize: partial.textSize !== undefined
      ? clampValue(Number(partial.textSize) || current.textSize, 50, 200)
      : current.textSize,
    lineDistance: partial.lineDistance !== undefined
      ? clampValue(Number(partial.lineDistance) || current.lineDistance, 100, 300)
      : current.lineDistance,
  };
  state.popoverSettings[key] = next;
  const popover = getPopoverElementByKey(key);
  if (popover) applyPopoverReadingSettings(popover);
  syncSettingsControls();
}

function resetPopoverState() {
  closeVisiblePopovers();
  state.popoverSettings = {};
  if (state.customizingPopoverKey) exitPopoverCustomization();
}

function closeVisiblePopovers() {
  document.querySelectorAll(".source-popover").forEach((popover) => closePopover(popover));
}

function refreshVisiblePopoverConnectors() {
  document.querySelectorAll(".source-popover").forEach((popover) => {
    const key = popover.dataset.popoverKey;
    const anchor = popover.anchorRef;
    const connector = key ? document.querySelector(`.popover-connector[data-popover-key="${CSS.escape(key)}"]`) : null;
    if (anchor && connector) updatePopoverConnector(anchor, popover, connector);
  });
}

function showPopover(anchor, text) {
  const key = getAnchorPopoverKey(anchor);
  const existing = document.querySelector(`.source-popover[data-popover-key="${CSS.escape(key)}"]`);
  if (existing) {
    existing.focus();
    return;
  }

  const connector = document.createElement("div");
  connector.className = "popover-connector";
  connector.dataset.popoverKey = key;
  connector.anchorRef = anchor;

  const popover = els.popoverTemplate.content.firstElementChild.cloneNode(true);
  popover.dataset.popoverKey = key;
  popover.anchorRef = anchor;
  popover.tabIndex = -1;
  popover.querySelector("p").textContent = text;
  const customizeButton = popover.querySelector(".customize-popover");
  customizeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.customizingPopoverKey === key) {
      exitPopoverCustomization();
    } else {
      enterPopoverCustomization(popover);
    }
  });
  popover.querySelector(".close-popover").addEventListener("click", (event) => {
    event.stopPropagation();
    closePopover(popover);
  });
  popover.addEventListener("click", (event) => event.stopPropagation());
  popover.addEventListener("pointerdown", (event) => event.stopPropagation());

  document.body.append(connector, popover);
  applyPopoverReadingSettings(popover);
  updatePopoverCustomizeButtons();

  const anchorPoint = getAnchorPoint(anchor);
  const maxLeft = Math.max(12, window.innerWidth - popover.offsetWidth - 12);
  const left = Math.min(Math.max(12, anchorPoint.x), maxLeft);
  const top = anchorPoint.y + anchorPoint.height + 8;
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(12, top)}px`;
  updatePopoverConnector(anchor, popover, connector);
  makePopoverDraggable(anchor, popover, connector);
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(() => updatePopoverConnector(anchor, popover, connector));
    observer.observe(popover);
    popover.resizeObserver = observer;
  }
  popover.focus({ preventScroll: true });
}

function refreshCounters() {
  els.fileName.textContent = state.file?.name || "None";
  els.pageCount.textContent = String(state.pages.length);
  if (els.paragraphCount) els.paragraphCount.textContent = String(getSourceItems().length);
}

async function handleFile(file, options = {}) {
  if (!file || (!isPdfFile(file) && !isDocxFile(file))) {
    setStatus("Choose a valid PDF, Word document, or Google Doc.", 0);
    return;
  }
  const fileKind = isPdfFile(file) ? "pdf" : "docx";
  const maxBytes = fileKind === "pdf" ? MAX_PDF_BYTES : MAX_DOCX_BYTES;
  if (file.size < 1 || file.size > maxBytes) {
    state.file = null;
    state.fileKind = "";
    state.fileSource = "";
    state.pdf = null;
    state.pages = [];
    state.objectId = null;
    state.annotations = [];
    state.summaryData = null;
    resetPopoverState();
    els.processButton.disabled = true;
    els.pages.innerHTML = "";
    els.fileName.textContent = file.name || "None";
    els.pageCount.textContent = "0";
    if (els.paragraphCount) els.paragraphCount.textContent = "0";
    setStatus("Document must be between 1 byte and 10 MB.", 0);
    return;
  }
  state.file = file;
  state.fileKind = fileKind;
  state.fileSource = options.source || fileKind;
  state.objectId = null;
  state.annotations = [];
  state.summaryData = null;
  resetPopoverState();
  els.processButton.disabled = true;
  els.pages.innerHTML = "";
  setStatus(fileKind === "pdf"
    ? "Loading PDF..."
    : state.fileSource === "google-doc"
    ? "Loading Google Doc..."
    : "Loading Word document...", 5);
  try {
    const parseResult = fileKind === "pdf" ? await parsePdf(file) : await parseDocx(file);
    refreshCounters();
    const sourceCount = getSourceItems().length;
    els.processButton.disabled = sourceCount < 1;

    if (parseResult.ocrUnavailableReason === "too-many-pages") {
      setStatus(`This looks like a scanned PDF. Browser OCR is available for scanned PDFs up to ${OCR_MAX_SCANNED_PAGES} pages right now.`, 0);
      return;
    }

    if (parseResult.ocrSkippedByUser) {
      setStatus("OCR skipped. This PDF does not have enough selectable paragraph text to transform without OCR.", 0);
      return;
    }

    if (parseResult.ocrApplied && sourceCount < 1) {
      setStatus("OCR finished, but I could not find enough readable paragraph text to transform.", 0);
      return;
    }

    if (sourceCount < 1) {
      setStatus("I could not find enough large paragraph text to transform in this document.", 0);
      return;
    }

    setStatus(fileKind === "docx"
      ? state.fileSource === "google-doc"
        ? "Google Doc ready. Transform it when you are ready."
        : "Word document ready. Transform it when you are ready."
      : parseResult.ocrApplied
      ? "OCR complete. PDF ready. Transform it when you are ready."
      : "PDF ready. Transform it when you are ready.", 45);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not read document.", 0);
  }
}

async function processCurrentDocument() {
  if (!state.file || !state.pages.length) return;
  els.processButton.disabled = true;
  try {
    state.objectId = null;
    resetPopoverState();
    await summarizeDocument();
    if (state.fileKind === "docx") {
      renderDocumentView();
    } else {
      await renderPdfPages();
    }
  } catch (error) {
    console.error(error);
  setStatus(error.message || "Transform failed.", 0);
  } finally {
    els.processButton.disabled = false;
  }
}

async function renderSample() {
  await loadSelectedFont();
  resetPopoverState();
  const width = 860;
  const height = 620;
  state.pdf = null;
  state.file = { name: "civil-war-sample.pdf" };
  state.fileKind = "sample";
  state.fileSource = "sample";
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
  const readingFontScale = getReadingFontScale();
  const sampleLineHeight = 22 * (getReadingLineHeight() / (DEFAULT_READING_SETTINGS.lineDistance / 100));
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1f2933";
  ctx.font = getCanvasFont(800, 34 * readingFontScale);
  ctx.fillText("History Notes", 82, 92);
  ctx.font = getCanvasFont(400, 15 * readingFontScale);
  wrapCanvasText(ctx, sampleText, 82, 150, 690, sampleLineHeight);
  const positionedAnnotations = layoutReplacementAnnotations(state.pages[0], state.annotations, ctx);
  clearReplacementRegions(ctx, positionedAnnotations);
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
  document.querySelectorAll(".page, .document-view").forEach((page) => {
    page.style.transform = `scale(${state.scale})`;
  });
}

function setAuthStatus(message) {
  if (els.authStatus) els.authStatus.textContent = message;
  if (els.accountStatus) els.accountStatus.textContent = message;
}

function showPage(pageName) {
  [
    ["operation", els.operationPage],
    ["auth", els.authPage],
    ["account", els.accountPage],
  ].forEach(([name, page]) => {
    if (!page) return;
    const active = name === pageName;
    page.hidden = !active;
    page.classList.toggle("active", active);
  });
  window.scrollTo(0, 0);
  refreshVisiblePopoverConnectors();
}

function showAuthPage(mode = "login") {
  setAuthMode(mode);
  showPage("auth");
}

function persistAuthSession(data) {
  state.auth.accessToken = data.access_token || "";
  state.auth.refreshToken = data.refresh_token || "";
  state.auth.user = data.user || null;
  localStorage.setItem("documentAnnotatorAccessToken", state.auth.accessToken);
  localStorage.setItem("documentAnnotatorRefreshToken", state.auth.refreshToken);
}

function clearAuthSession() {
  state.auth.accessToken = "";
  state.auth.refreshToken = "";
  state.auth.user = null;
  state.auth.subscription = null;
  localStorage.removeItem("documentAnnotatorAccessToken");
  localStorage.removeItem("documentAnnotatorRefreshToken");
}

function renderAuthState() {
  const signedIn = Boolean(state.auth.user && state.auth.accessToken);
  if (els.authForm) els.authForm.hidden = signedIn;
  if (els.verifyForm) els.verifyForm.hidden = signedIn;
  if (els.accountSession) els.accountSession.hidden = !signedIn;
  if (els.accountEmail) els.accountEmail.textContent = state.auth.user?.email || "";
  if (els.accountPageSubtitle) {
    els.accountPageSubtitle.textContent = signedIn
      ? "Manage your account and membership."
      : "Log in or sign up to manage your account.";
  }
  if (els.signupNavButton) els.signupNavButton.hidden = signedIn;
  if (els.loginNavButton) els.loginNavButton.textContent = signedIn ? "Log out" : "Log in";
  if (els.membershipButton) els.membershipButton.disabled = !signedIn;
  if (signedIn) {
    const subscription = state.auth.subscription;
    const active = subscription && ["active", "trialing"].includes(String(subscription.status || "").toLowerCase());
    setAuthStatus(active ? "Membership active." : "Logged in. Membership is optional.");
  } else {
    setAuthStatus("Log in to manage membership.");
  }
}

async function authRequest(path, body, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(`${AUTH_BASE}${path}`, {
    method: options.method || "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "Account request failed.");
  return data;
}

async function loadCurrentUser() {
  if (!state.auth.accessToken) {
    renderAuthState();
    return;
  }
  try {
    const response = await fetch(`${AUTH_BASE}/me`, {
      headers: { Authorization: `Bearer ${state.auth.accessToken}` },
    });
    if (!response.ok) throw new Error("Session expired.");
    state.auth.user = await response.json();
    await loadSubscriptionStatus();
  } catch (error) {
    console.warn(error);
    clearAuthSession();
  }
  renderAuthState();
}

async function loadSubscriptionStatus() {
  if (!state.auth.accessToken) return;
  try {
    const response = await fetch(`${API_BASE}/billing/subscription`, {
      headers: { Authorization: `Bearer ${state.auth.accessToken}` },
    });
    if (response.ok) {
      state.auth.subscription = await response.json();
    }
  } catch (error) {
    console.warn("Could not load subscription status", error);
  }
}

function setAuthMode(mode) {
  state.authMode = mode;
  els.loginTab?.classList.toggle("active", mode === "login");
  els.signupTab?.classList.toggle("active", mode === "signup");
  if (els.authPageTitle) els.authPageTitle.textContent = mode === "signup" ? "Sign up" : "Log in";
  if (els.authName) els.authName.hidden = mode !== "signup";
  if (els.authSubmit) els.authSubmit.textContent = mode === "signup" ? "Create account" : "Log in";
  if (els.authPassword) els.authPassword.autocomplete = mode === "signup" ? "new-password" : "current-password";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  const displayName = els.authName.value.trim();
  if (!email || !password) {
    setAuthStatus("Enter an email and password.");
    return;
  }

  try {
    els.authSubmit.disabled = true;
    if (state.authMode === "signup") {
      setAuthStatus("Creating account...");
      await authRequest("/signup", { email, password, display_name: displayName || undefined });
      setAuthStatus("Account created. Logging in...");
    } else {
      setAuthStatus("Logging in...");
    }
    const session = await authRequest("/login", { email, password });
    persistAuthSession(session);
    await loadSubscriptionStatus();
    renderAuthState();
    showPage("account");
  } catch (error) {
    setAuthStatus(error.message || "Account request failed.");
  } finally {
    els.authSubmit.disabled = false;
  }
}

async function handleVerifyEmail(event) {
  event.preventDefault();
  const email = els.verifyEmail.value.trim();
  const code = els.verifyCode.value.trim();
  if (!email || !code) {
    setAuthStatus("Enter the email and verification code.");
    return;
  }
  try {
    await authRequest("/verify-email", { email, code });
    setAuthStatus("Email verified. You can log in.");
  } catch (error) {
    setAuthStatus(error.message || "Could not verify email.");
  }
}

async function logout() {
  if (state.auth.accessToken) {
    fetch(`${AUTH_BASE}/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.auth.accessToken}` },
    }).catch(() => {});
  }
  clearAuthSession();
  renderAuthState();
}

async function startMembershipCheckout() {
  if (!state.auth.accessToken) {
    setAuthStatus("Log in before starting membership checkout.");
    showAuthPage("login");
    return;
  }
  try {
    els.membershipButton.disabled = true;
    setAuthStatus("Preparing membership checkout...");
    const plansResponse = await fetch(`${API_BASE}/billing/plans`);
    const plansData = await plansResponse.json().catch(() => ({}));
    if (!plansResponse.ok) throw new Error(plansData.error || "Could not load membership plan.");
    const plans = Array.isArray(plansData) ? plansData : plansData.plans || [];
    const getPlanPrice = (item) => Number(item.priceCents ?? item.price_cents);
    const getPlanInterval = (item) => item.interval || item.billing_interval;
    const getPlanId = (item) => item.id || item.plan_id;
    const plan = plans.find((item) => item.active !== false && getPlanInterval(item) === "month" && getPlanPrice(item) === 1200)
      || plans.find((item) => item.active !== false && /member/i.test(item.name || "") && getPlanInterval(item) === "month");
    const planId = getPlanId(plan || {});
    if (!planId) {
      throw new Error("Membership checkout is not configured yet. Stripe Connect needs a $12/month plan first.");
    }
    const response = await fetch(`${API_BASE}/billing/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.auth.accessToken}`,
      },
      body: JSON.stringify({
        planId,
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not start checkout.");
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    throw new Error("Checkout did not return a payment URL.");
  } catch (error) {
    setAuthStatus(error.message || "Could not start membership checkout.");
  } finally {
    els.membershipButton.disabled = false;
  }
}

function populateModelSelect(models) {
  state.models = models.length ? models : FALLBACK_MODELS;
  els.modelSelect.innerHTML = "";
  state.models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.name || model.id;
    option.title = model.id;
    els.modelSelect.appendChild(option);
  });

  const defaultExists = state.models.some((model) => model.id === DEFAULT_MODEL);
  state.selectedModel = defaultExists ? DEFAULT_MODEL : state.models[0].id;
  els.modelSelect.value = state.selectedModel;
}

async function loadModelOptions() {
  try {
    const response = await fetch(`${API_BASE}/fn/list-ai-models`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load AI models");
    populateModelSelect(data.models || []);
  } catch (error) {
    console.warn(error);
    populateModelSelect(FALLBACK_MODELS);
  }
}

function enableExtractionDebugApi() {
  if (!new URLSearchParams(window.location.search).has("debugExtraction")) return;
  window.__pdfAnnotatorDebug = {
    getPages: () => state.pages,
    getSourceItems: () => getSourceItems(),
    getRejectSummary: () => state.pages.flatMap((page) => (
      page.items.map((item) => ({
        id: item.id,
        pageNumber: item.pageNumber,
        kind: item.kind,
        tableLike: Boolean(item.tableLike),
        rejectReason: getSourceBlockRejectReason(item),
        words: countWords(item.text || ""),
        sentences: countSentences(item.text || ""),
        lineCount: item.lineBoxes?.length || 0,
        text: normalizeText(item.text || "").slice(0, 220),
      }))
    )),
  };
}

enableExtractionDebugApi();
if (!FONT_OPTIONS[state.selectedFont]) state.selectedFont = "lexend";
state.headerColor = normalizeHexColor(state.headerColor, COLOR_OPTIONS.blue);
state.bulletColor = normalizeHexColor(state.bulletColor, COLOR_OPTIONS.rose);
renderColorGrid(els.headerColorGrid, "header");
renderColorGrid(els.bulletColorGrid, "bullet");
applyReadingSettings();
loadSelectedFont().catch((error) => console.warn("Could not preload selected font", error));
setAuthMode("login");
renderAuthState();
loadCurrentUser();

els.operationNavButton.addEventListener("click", () => showPage("operation"));
els.accountNavButton.addEventListener("click", () => showPage("account"));
els.loginNavButton.addEventListener("click", () => {
  if (state.auth.user && state.auth.accessToken) {
    logout();
    return;
  }
  showAuthPage("login");
});
els.signupNavButton.addEventListener("click", () => showAuthPage("signup"));
els.input.addEventListener("change", (event) => handleFile(event.target.files[0]));
els.googleDocForm.addEventListener("submit", handleGoogleDocImport);
els.processButton.addEventListener("click", processCurrentDocument);
els.zoomIn.addEventListener("click", () => setZoom(state.scale + 0.1));
els.zoomOut.addEventListener("click", () => setZoom(state.scale - 0.1));
els.fontSelect.addEventListener("change", (event) => {
  if (state.customizingPopoverKey) {
    updateLocalPopoverSettings({ font: event.target.value });
    return;
  }
  updateGlobalReadingSettings({ font: event.target.value }, true).catch((error) => {
    console.error(error);
    setStatus("Font changed, but the preview could not be redrawn.", 0);
  });
});
els.textSizeRange.addEventListener("input", (event) => {
  if (state.customizingPopoverKey) {
    updateLocalPopoverSettings({ textSize: event.target.value });
    return;
  }
  updateGlobalReadingSettings({ textSize: event.target.value }).catch((error) => {
    console.error(error);
    setStatus("Text size changed, but the preview could not be redrawn.", 0);
  });
});
els.lineDistanceRange.addEventListener("input", (event) => {
  if (state.customizingPopoverKey) {
    updateLocalPopoverSettings({ lineDistance: event.target.value });
    return;
  }
  updateGlobalReadingSettings({ lineDistance: event.target.value }).catch((error) => {
    console.error(error);
    setStatus("Line distance changed, but the preview could not be redrawn.", 0);
  });
});
els.settingsDoneButton.addEventListener("click", exitPopoverCustomization);
els.headerColorInput.addEventListener("input", (event) => {
  updateAnnotationColors({ headerColor: event.target.value }).catch((error) => {
    console.error(error);
    setStatus("Header color changed, but the preview could not be redrawn.", 0);
  });
});
els.bulletColorInput.addEventListener("input", (event) => {
  updateAnnotationColors({ bulletColor: event.target.value }).catch((error) => {
    console.error(error);
    setStatus("Bullet color changed, but the preview could not be redrawn.", 0);
  });
});
els.headerHexInput.addEventListener("change", (event) => {
  updateAnnotationColors({ headerColor: event.target.value }).catch((error) => {
    console.error(error);
    setStatus("Header color changed, but the preview could not be redrawn.", 0);
  });
});
els.bulletHexInput.addEventListener("change", (event) => {
  updateAnnotationColors({ bulletColor: event.target.value }).catch((error) => {
    console.error(error);
    setStatus("Bullet color changed, but the preview could not be redrawn.", 0);
  });
});
els.headerColorTrigger.addEventListener("click", () => toggleColorDropdown("header"));
els.bulletColorTrigger.addEventListener("click", () => toggleColorDropdown("bullet"));
document.addEventListener("click", (event) => {
  if (event.target.closest(".color-setting")) return;
  closeColorDropdowns();
});
els.loginTab.addEventListener("click", () => setAuthMode("login"));
els.signupTab.addEventListener("click", () => setAuthMode("signup"));
els.authForm.addEventListener("submit", handleAuthSubmit);
els.verifyForm.addEventListener("submit", handleVerifyEmail);
els.membershipButton.addEventListener("click", startMembershipCheckout);
els.modelSelect.addEventListener("change", () => {
  state.selectedModel = els.modelSelect.value || DEFAULT_MODEL;
});
window.addEventListener("scroll", refreshVisiblePopoverConnectors, true);
window.addEventListener("resize", refreshVisiblePopoverConnectors);

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
loadModelOptions();
