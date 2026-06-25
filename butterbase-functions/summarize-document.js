const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_RETRY_MODEL = "google/gemini-3.1-flash-lite";
const MAX_SOURCE_CHARS = 85000;
const MAX_SOURCE_BLOCKS = 180;
const MIN_SOURCE_SENTENCES = 3;
const MIN_SOURCE_WORDS = 40;
const DEBUG_CAPTURE_PREFIX = "debug-ai-runs";
const DEBUG_CAPTURE_CONTENT_TYPE = "application/json";

const SYSTEM_PROMPT = `You are an expert ADHD-friendly reading structure engine.

You receive articles as numbered sentences. Your job is only:
1. Divide each article into meaningful sections.
2. Give each section a clear title.
3. Divide each section into meaning-based bullet ranges.
4. Give each bullet range a short clickable label.

Important rules:
- Split by meaning and structure, not by fixed sentence count.
- A section can contain one sentence or many sentences.
- A bullet can cover one sentence or many adjacent sentences.
- Preserve the original order.
- Cover every sentence exactly once with section ranges.
- Cover every sentence exactly once with bullet ranges.
- Bullet ranges must stay inside their section range.
- Do not omit sentences.
- Do not invent information.
- Do not return original source text.
- Keep bullet labels 3 to 10 words when possible.
- Keep section titles 3 to 8 words when possible.

Return only valid compact JSON. No markdown, commentary, code fences, or extra keys.`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function validationResult(error, code) {
  return json({ error, code, skipped: true });
}

function gatewayBase(ctx) {
  const raw = ctx?.env?.BUTTERBASE_API_URL || "https://api.butterbase.ai";
  return raw.replace(/\/v1\/[^/]+\/?$/, "").replace(/\/$/, "");
}

function debugEnabled(ctx) {
  return String(ctx?.env?.AI_DEBUG_CAPTURE_ENABLED ?? "true").toLowerCase() !== "false";
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function countWords(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function countSentences(text) {
  return (normalizeText(text).match(/[.!?]+(?=\s|$)/g) || []).length;
}

function isTitleCaseLike(text) {
  const words = normalizeText(text).match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (!words.length) return false;
  const titleWords = words.filter((word) => /^[A-Z]/.test(word) || word.length <= 3);
  return titleWords.length / words.length >= 0.7;
}

function isLikelyHeaderBlock(text) {
  const normalized = normalizeText(text);
  if (/^\d+[.)]?$/.test(normalized)) return true;
  if (/^page\s+\d+$/i.test(normalized)) return true;
  const words = countWords(normalized);
  if (words <= 10 && /:$/.test(normalized)) return true;
  if (words <= 7 && countSentences(normalized) <= 1 && isTitleCaseLike(normalized) && !/,/.test(normalized)) return true;
  if (words <= 9 && countSentences(normalized) === 0 && isTitleCaseLike(normalized)) return true;
  return false;
}

function shortLabel(text, maxWords = 10, maxChars = 72) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const shortened = words.length > maxWords ? words.slice(0, maxWords).join(" ") : normalized;
  return shortened.length > maxChars ? `${shortened.slice(0, maxChars - 1).trim()}...` : shortened;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch (_) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(raw.slice(first, last + 1));
    throw new Error("Model did not return parseable JSON");
  }
}

function splitIntoSentences(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?:\s+|$)|[^.!?]+$/g)
    ?.map((sentence) => normalizeText(sentence))
    .filter(Boolean) || [normalized];
}

function sourceBlockSentences(sourceBlocks) {
  const sentences = [];
  sourceBlocks.forEach((block) => {
    splitIntoSentences(block.text).forEach((sentenceText) => {
      if (isLikelyHeaderBlock(sentenceText)) return;
      sentences.push({
        index: sentences.length + 1,
        text: sentenceText,
        sourceBlockId: block.id,
      });
    });
  });
  return sentences;
}

function hasEnoughSourceSentences(block) {
  const sourceSentences = splitIntoSentences(block.text).filter((sentence) => !isLikelyHeaderBlock(sentence));
  if (block.fromOcr) {
    return sourceSentences.length >= 1 && countWords(block.text) >= MIN_SOURCE_WORDS;
  }
  return sourceSentences.length >= MIN_SOURCE_SENTENCES;
}

function normalizeArticles(rawArticles) {
  return asArray(rawArticles).map((article, articleIndex) => {
    const sourceBlocks = asArray(article.sourceBlocks)
      .slice(0, MAX_SOURCE_BLOCKS)
      .map((block, blockIndex) => ({
        id: String(block.id || `article-${articleIndex}-block-${blockIndex}`),
        order: Number.isFinite(block.order) ? block.order : blockIndex,
        pageNumber: Number.isFinite(block.pageNumber) ? block.pageNumber : null,
        kind: String(block.kind || "text"),
        fromOcr: Boolean(block.fromOcr),
        sourceLines: asArray(block.sourceLines).map(normalizeText).filter(Boolean),
        text: normalizeText(block.text),
      }))
      .filter((block) => !isLikelyHeaderBlock(block.text))
      .filter(hasEnoughSourceSentences)
      .filter((block) => countWords(block.text) >= MIN_SOURCE_WORDS);

    const sentences = sourceBlockSentences(sourceBlocks);
    return {
      articleId: String(article.articleId || `article-${articleIndex + 1}`),
      title: normalizeText(article.title) || `Article ${articleIndex + 1}`,
      sourceBlocks,
      sentences,
    };
  }).filter((article) => article.sentences.length);
}

function compactArticlesForPrompt(articles) {
  return articles.map((article) => ({
    id: article.articleId,
    t: article.title,
    sent: article.sentences.map((sentence) => [sentence.index, sentence.text]),
  }));
}

function buildUserPrompt(title, articles) {
  return `Return this exact compact JSON shape:
{
  "d": "document title",
  "a": [
    {
      "id": "article id from input",
      "t": "article title",
      "sec": [
        {
          "t": "section title",
          "r": [firstSentenceIndex, lastSentenceIndex],
          "b": [
            { "l": "short bullet label", "r": [firstSentenceIndex, lastSentenceIndex] }
          ]
        }
      ]
    }
  ]
}

Range rules:
- All ranges are inclusive.
- Ranges must use sentence indexes from the input.
- Section ranges must cover every sentence exactly once.
- Bullet ranges must cover every sentence exactly once.
- Bullet ranges must be adjacent spans inside the section range.
- Return no source text.

Document title: ${title}

Input:
${JSON.stringify({ d: title, a: compactArticlesForPrompt(articles) })}`;
}

function parseInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function rangeFromValue(value, label) {
  if (Array.isArray(value)) {
    const indexes = value.map(parseInteger);
    if (indexes.some((index) => index === null)) throw new Error(`${label} has a non-numeric range`);
    if (indexes.length === 2) {
      const [start, end] = indexes;
      if (start > end) throw new Error(`${label} range starts after it ends`);
      return { start, end };
    }
    if (indexes.length > 2) {
      const sorted = [...indexes].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i] !== sorted[i - 1] + 1) throw new Error(`${label} range is not contiguous`);
      }
      return { start: sorted[0], end: sorted[sorted.length - 1] };
    }
  }

  if (value && typeof value === "object") {
    const start = parseInteger(value.start ?? value.first ?? value.from);
    const end = parseInteger(value.end ?? value.last ?? value.to ?? value.ends_after);
    if (start !== null && end !== null && start <= end) return { start, end };
  }

  throw new Error(`${label} is missing a valid sentence range`);
}

function indexesForRange(range) {
  return Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index);
}

function rangeInside(child, parent) {
  return child.start >= parent.start && child.end <= parent.end;
}

function uniqueSourceIdsForIndexes(article, indexes) {
  const byIndex = new Map(article.sentences.map((sentence) => [sentence.index, sentence]));
  return [...new Set(indexes.map((index) => byIndex.get(index)?.sourceBlockId).filter(Boolean))];
}

function textForIndexes(article, indexes) {
  const byIndex = new Map(article.sentences.map((sentence) => [sentence.index, sentence]));
  return indexes.map((index) => byIndex.get(index)?.text).filter(Boolean).join(" ");
}

function sourceRunsForIndexes(article, indexes) {
  const byIndex = new Map(article.sentences.map((sentence) => [sentence.index, sentence]));
  const runs = [];
  indexes.forEach((index) => {
    const sentence = byIndex.get(index);
    if (!sentence?.sourceBlockId) return;
    const current = runs[runs.length - 1];
    if (current?.sourceBlockId === sentence.sourceBlockId) {
      current.indexes.push(index);
      return;
    }
    runs.push({
      sourceBlockId: sentence.sourceBlockId,
      indexes: [index],
    });
  });
  return runs;
}

function addCoverage(coverage, indexes, validIndexes, label) {
  indexes.forEach((index) => {
    if (!validIndexes.has(index)) throw new Error(`${label} references missing sentence ${index}`);
    if (coverage.has(index)) throw new Error(`${label} overlaps sentence ${index}`);
    coverage.add(index);
  });
}

function ensureCovered(requiredIndexes, coverage, label) {
  const missing = requiredIndexes.filter((index) => !coverage.has(index));
  if (missing.length) throw new Error(`${label} missed sentence ${missing[0]}`);
}

function sectionsFromArticleResult(articleResult) {
  return asArray(articleResult?.sections || articleResult?.sec || articleResult?.s);
}

function bulletsFromSectionResult(sectionResult) {
  return asArray(sectionResult?.bullets || sectionResult?.blocks || sectionResult?.b);
}

function rangeValueFromResult(result, previousEnd = null) {
  const explicit = result?.range || result?.sentenceRange || result?.r || result?.sentences;
  if (explicit) return explicit;
  const end = parseInteger(result?.end ?? result?.ends_after);
  if (end !== null && previousEnd !== null) return [previousEnd + 1, end];
  return null;
}

function normalizeModelResult(parsed, title, inputArticles) {
  const parsedArticles = asArray(parsed.articles || parsed.a);
  let totalSections = 0;
  let totalBlocks = 0;

  const articles = inputArticles.map((inputArticle, articleIndex) => {
    const articleResult = parsedArticles.find((candidate) => String(candidate.articleId || candidate.id) === inputArticle.articleId)
      || parsedArticles[articleIndex]
      || {};
    const validIndexes = new Set(inputArticle.sentences.map((sentence) => sentence.index));
    const allIndexes = inputArticle.sentences.map((sentence) => sentence.index);
    const sectionCoverage = new Set();
    const bulletCoverage = new Set();
    let previousSectionEnd = 0;

    const sections = sectionsFromArticleResult(articleResult).map((section, sectionIndex) => {
      const sectionRange = rangeFromValue(rangeValueFromResult(section, previousSectionEnd), `section ${sectionIndex + 1}`);
      previousSectionEnd = sectionRange.end;
      const sectionIndexes = indexesForRange(sectionRange);
      addCoverage(sectionCoverage, sectionIndexes, validIndexes, `section ${sectionIndex + 1}`);

      const sectionBulletCoverage = new Set();
      const blocks = bulletsFromSectionResult(section).flatMap((bullet, bulletIndex) => {
        const bulletRange = rangeFromValue(rangeValueFromResult(bullet), `section ${sectionIndex + 1} bullet ${bulletIndex + 1}`);
        if (!rangeInside(bulletRange, sectionRange)) {
          throw new Error(`section ${sectionIndex + 1} bullet ${bulletIndex + 1} is outside its section range`);
        }

        const bulletIndexes = indexesForRange(bulletRange);
        addCoverage(sectionBulletCoverage, bulletIndexes, validIndexes, `section ${sectionIndex + 1} bullet coverage`);
        addCoverage(bulletCoverage, bulletIndexes, validIndexes, `article ${articleIndex + 1} bullet coverage`);

        const sourceBlockIds = uniqueSourceIdsForIndexes(inputArticle, bulletIndexes);
        const bulletLabel = shortLabel(bullet.bullet || bullet.label || bullet.l || `Point ${bulletIndex + 1}`);
        if (!sourceBlockIds.length || !bulletLabel) return [];

        const sourceRuns = sourceRunsForIndexes(inputArticle, bulletIndexes);
        return sourceRuns.map((run, runIndex) => {
          const sourceText = textForIndexes(inputArticle, run.indexes);
          if (!sourceText) return null;
          totalBlocks += 1;
          const suffix = sourceRuns.length > 1 ? `-part-${runIndex + 1}` : "";
          return {
            blockId: String(bullet.blockId || bullet.id || `${inputArticle.articleId}-s${sectionIndex + 1}-b${bulletIndex + 1}`) + suffix,
            bullet: bulletLabel,
            sourceBlockIds: [run.sourceBlockId],
            sourceText,
            sentenceRange: [run.indexes[0], run.indexes[run.indexes.length - 1]],
            continuedFromRange: sourceRuns.length > 1 ? [bulletRange.start, bulletRange.end] : undefined,
          };
        }).filter(Boolean);
      }).filter(Boolean);

      ensureCovered(sectionIndexes, sectionBulletCoverage, `section ${sectionIndex + 1} bullets`);
      if (!blocks.length) throw new Error(`section ${sectionIndex + 1} has no valid bullets`);

      totalSections += 1;
      return {
        sectionId: String(section.sectionId || section.id || `${inputArticle.articleId}-s${sectionIndex + 1}`),
        title: shortLabel(section.title || section.t || `Section ${sectionIndex + 1}`, 8, 70),
        sourceBlockIds: uniqueSourceIdsForIndexes(inputArticle, sectionIndexes),
        sourceText: textForIndexes(inputArticle, sectionIndexes),
        sentenceRange: [sectionRange.start, sectionRange.end],
        blocks,
      };
    });

    ensureCovered(allIndexes, sectionCoverage, `article ${articleIndex + 1} sections`);
    ensureCovered(allIndexes, bulletCoverage, `article ${articleIndex + 1} bullets`);
    if (!sections.length) throw new Error(`article ${articleIndex + 1} has no valid sections`);

    return {
      articleId: inputArticle.articleId,
      title: normalizeText(articleResult.title || articleResult.t) || inputArticle.title,
      sections,
    };
  });

  return {
    document: {
      title: normalizeText(parsed?.document?.title || parsed?.d) || title,
    },
    articles,
    stats: {
      sections: totalSections,
      blocks: totalBlocks,
    },
  };
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function filenameSafe(value, maxLength = 80) {
  const safe = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return safe || "untitled";
}

function debugFilename({ timestamp, title, model, status }) {
  const safeTime = timestamp.replace(/[:.]/g, "-");
  return `${DEBUG_CAPTURE_PREFIX}/${safeTime}-${filenameSafe(status, 20)}-${filenameSafe(model, 64)}-${filenameSafe(title)}.json`;
}

async function uploadJsonToStorage({ ctx, appId, apiKey, filename, data }) {
  const jsonText = JSON.stringify(data, null, 2);
  const uploadResponse = await fetch(`${gatewayBase(ctx)}/storage/${appId}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      filename,
      contentType: DEBUG_CAPTURE_CONTENT_TYPE,
      sizeBytes: byteLength(jsonText),
    }),
  });
  const uploadData = await uploadResponse.json();
  if (!uploadResponse.ok) {
    throw new Error(uploadData?.error?.message || uploadData?.error || "Could not create debug upload URL");
  }

  const putResponse = await fetch(uploadData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": DEBUG_CAPTURE_CONTENT_TYPE },
    body: jsonText,
  });
  if (!putResponse.ok) throw new Error("Could not upload debug capture JSON");

  return {
    objectId: uploadData.objectId || uploadData.object_id || null,
    objectKey: uploadData.objectKey || uploadData.object_key || null,
    filename,
    sizeBytes: byteLength(jsonText),
  };
}

async function saveAiDebugCapture({ ctx, appId, apiKey, title, filename, requestedModel, model, status, articles, prompt, aiData, rawContent, parsed, result, usage, error, attemptIndex }) {
  if (!debugEnabled(ctx) || !apiKey) return null;

  const timestamp = new Date().toISOString();
  const capture = {
    schemaVersion: 1,
    capturedAt: timestamp,
    status,
    appId,
    request: {
      title,
      filename,
      requestedModel,
      model,
      attemptIndex,
    },
    debug: {
      storagePrefix: DEBUG_CAPTURE_PREFIX,
    },
    input: {
      articles,
      prompt,
    },
    ai: {
      rawContent,
      parsed,
      usage: usage || aiData?.usage || null,
      responseMetadata: {
        id: aiData?.id || null,
        model: aiData?.model || null,
        object: aiData?.object || null,
        created: aiData?.created || null,
      },
    },
    backend: {
      normalizedResult: result || null,
      error: error ? {
        message: error.message || String(error),
        status: error.status || null,
        stack: error.stack || null,
      } : null,
    },
  };

  try {
    const savedCapture = await uploadJsonToStorage({
      ctx,
      appId,
      apiKey,
      filename: debugFilename({ timestamp, title, model, status }),
      data: capture,
    });
    console.info("AI debug capture saved", JSON.stringify({
      status,
      model,
      objectId: savedCapture.objectId,
      objectKey: savedCapture.objectKey,
      filename: savedCapture.filename,
      sizeBytes: savedCapture.sizeBytes,
    }));
    return savedCapture;
  } catch (captureError) {
    console.warn("AI debug capture failed", captureError?.message || captureError);
    return null;
  }
}

async function requestSummary({ ctx, appId, apiKey, model, title, articles }) {
  const prompt = buildUserPrompt(title, articles);
  const response = await fetch(`${gatewayBase(ctx)}/v1/${appId}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 6000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });

  const aiData = await response.json();
  if (!response.ok) {
    const error = new Error(aiData?.error?.message || aiData?.error || "Butterbase AI request failed");
    error.status = response.status;
    error.debugCapture = {
      prompt,
      aiData,
      rawContent: null,
      parsed: null,
      result: null,
    };
    throw error;
  }

  const content = aiData?.choices?.[0]?.message?.content || aiData?.content || "";
  let parsed = null;
  let result = null;
  try {
    parsed = extractJson(content);
    result = normalizeModelResult(parsed, title, articles);
    if (!result.articles.length) throw new Error("The model returned no usable sentence-linked structure");
  } catch (error) {
    error.debugCapture = {
      prompt,
      aiData,
      rawContent: content,
      parsed,
      result,
    };
    throw error;
  }

  return { result, usage: aiData.usage || null, prompt, aiData, rawContent: content, parsed };
}

export default async function handler(req, ctx) {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "Request body must be valid JSON" }, 400);
  }

  const title = normalizeText(body.title || body.filename || "Uploaded PDF");
  const articles = normalizeArticles(body.articles);
  if (!articles.length) {
    return validationResult("No readable long-form article text was provided", "not_enough_readable_text");
  }

  const sourceChars = articles.reduce((sum, article) => (
    sum + article.sourceBlocks.reduce((inner, block) => inner + block.text.length, 0)
  ), 0);
  if (sourceChars > MAX_SOURCE_CHARS) {
    return validationResult("This PDF has too much extracted text for one AI request. Try a shorter PDF for now.", "too_much_text");
  }

  const apiKey = ctx?.env?.BUTTERBASE_API_KEY;
  if (!apiKey) return json({ error: "Butterbase AI API key is not configured for this function" }, 500);

  const appId = ctx?.env?.BUTTERBASE_APP_ID || "app_jnnlkgx7ehdy";
  const requestedModel = normalizeText(body.model) || DEFAULT_MODEL;
  const modelsToTry = requestedModel === DEFAULT_MODEL ? [DEFAULT_MODEL, DEFAULT_RETRY_MODEL] : [requestedModel];
  const errors = [];

  for (const [attemptIndex, model] of modelsToTry.entries()) {
    try {
      const { result, usage, prompt, aiData, rawContent, parsed } = await requestSummary({ ctx, appId, apiKey, model, title, articles });
      await saveAiDebugCapture({
        ctx,
        appId,
        apiKey,
        title,
        filename: body.filename,
        requestedModel,
        model,
        status: "success",
        articles,
        prompt,
        aiData,
        rawContent,
        parsed,
        result,
        usage,
        attemptIndex,
      });
      return json({
        ...result,
        model,
        originalModel: requestedModel,
        fallbackUsed: model !== requestedModel,
        attemptedModels: modelsToTry.slice(0, modelsToTry.indexOf(model) + 1),
        usage,
      });
    } catch (error) {
      const debugCaptureData = error.debugCapture;
      if (debugCaptureData) {
        await saveAiDebugCapture({
          ctx,
          appId,
          apiKey,
          title,
          filename: body.filename,
          requestedModel,
          model,
          status: "error",
          articles,
          prompt: debugCaptureData.prompt,
          aiData: debugCaptureData.aiData,
          rawContent: debugCaptureData.rawContent,
          parsed: debugCaptureData.parsed,
          result: debugCaptureData.result,
          usage: debugCaptureData.aiData?.usage || null,
          error,
          attemptIndex,
        });
      }
      errors.push({
        model,
        message: error.message || "Unknown AI error",
        status: error.status || 502,
      });
    }
  }

  const lastError = errors[errors.length - 1];
  return json({
    error: lastError?.message || "AI summarization failed",
    model: requestedModel,
    fallbackModel: requestedModel === DEFAULT_MODEL ? DEFAULT_RETRY_MODEL : null,
    attemptedModels: modelsToTry,
    attempts: errors,
  }, lastError?.status || 502);
}
