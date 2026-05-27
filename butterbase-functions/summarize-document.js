const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const MAX_SOURCE_CHARS = 85000;
const MAX_SOURCE_BLOCKS = 160;

const SYSTEM_PROMPT = `You are an expert reading-comprehension restructuring engine for ADHD-friendly reading.

Your task is to transform full articles into a structured reading map.

You must do exactly four things:
1. Divide each article into meaningful sections.
2. Generate a clear title for each section.
3. Divide each section into smaller content blocks based on meaning.
4. Summarize each block into a short bullet label.

Important rules:
- Split by meaning and structure, not mechanically by sentence count.
- A section may contain one or multiple source blocks.
- A content block may contain one sentence or multiple sentences.
- All sections together must cover the entire article.
- All blocks together must cover the entire section.
- Preserve the original article order.
- Do not omit major ideas.
- Do not invent information.
- Each section must include sourceBlockIds and exact sourceText copied from the input.
- Each block must include sourceBlockIds and exact sourceText copied from the input.
- Prefer one sourceBlockId per block when one source block contains the whole idea.
- If one idea continues across adjacent source blocks, include multiple adjacent sourceBlockIds.
- Bullet labels should be 3 to 10 words and useful as clickable links.
- Section titles should be 3 to 8 words and describe the section's main purpose.
- If uncertain whether content deserves its own block, create a block instead of dropping it.

Return only valid JSON. Do not include markdown, commentary, explanations, or code fences.`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function gatewayBase(ctx) {
  const raw = ctx?.env?.BUTTERBASE_API_URL || "https://api.butterbase.ai";
  return raw.replace(/\/v1\/[^/]+\/?$/, "").replace(/\/$/, "");
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeForMatch(text) {
  return normalizeText(text).toLowerCase().replace(/[^\w\s]/g, " ");
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

function coerceIdList(value, knownIds) {
  return asArray(value)
    .map((id) => String(id))
    .filter((id) => knownIds.has(id));
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

function findBlockIdsByText(sourceText, sourceBlocks, allowedIds = []) {
  const needle = normalizeForMatch(sourceText);
  if (!needle) return [];
  const allowed = allowedIds.length ? new Set(allowedIds) : null;
  const candidates = sourceBlocks.filter((block) => !allowed || allowed.has(block.id));

  const direct = candidates.find((block) => normalizeForMatch(block.text).includes(needle));
  if (direct) return [direct.id];

  const needleWords = new Set(needle.split(/\s+/).filter((word) => word.length > 3));
  let best = null;
  let bestScore = 0;
  candidates.forEach((block) => {
    const words = normalizeForMatch(block.text).split(/\s+/);
    const overlap = words.filter((word) => needleWords.has(word)).length;
    const score = overlap / Math.max(1, needleWords.size);
    if (score > bestScore) {
      best = block;
      bestScore = score;
    }
  });

  return best && bestScore >= 0.35 ? [best.id] : [];
}

function sourceTextFromIds(ids, byId) {
  return ids.map((id) => byId.get(id)?.text).filter(Boolean).join(" ");
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
        text: normalizeText(block.text),
      }))
      .filter((block) => block.text.length >= 20);

    return {
      articleId: String(article.articleId || `article-${articleIndex + 1}`),
      title: normalizeText(article.title) || `Article ${articleIndex + 1}`,
      sourceBlocks,
    };
  }).filter((article) => article.sourceBlocks.length);
}

function buildUserPrompt(title, articles) {
  return `Restructure the following article(s) into ADHD-friendly reading annotations.

Return this exact JSON shape:
{
  "document": {
    "title": "string"
  },
  "articles": [
    {
      "articleId": "string",
      "title": "string",
      "sections": [
        {
          "sectionId": "string",
          "title": "string",
          "sourceBlockIds": ["string"],
          "sourceText": "exact original text covered by this section",
          "blocks": [
            {
              "blockId": "string",
              "bullet": "short clickable bullet summary",
              "sourceBlockIds": ["string"],
              "sourceText": "exact original text covered by this block"
            }
          ]
        }
      ]
    }
  ],
  "stats": {
    "sections": number,
    "blocks": number
  }
}

Output rules:
- Each article must have at least one section.
- Each section must have at least one block.
- Use only sourceBlockIds that appear in the input.
- Section sourceText must be copied from the input source blocks.
- Block sourceText must be copied from the input source blocks.
- Blocks inside a section should cover the full section sourceText.
- Do not create bullets for page numbers, footers, or tiny fragments.
- Keep bullet labels between 3 and 10 words when possible.
- Keep section titles between 3 and 8 words when possible.
- Do not include coordinates. The frontend places annotations from sourceBlockIds.
- Return valid JSON only.

Document title: ${title}

Input articles:
${JSON.stringify({ articles })}`;
}

function normalizeModelResult(parsed, title, inputArticles) {
  const inputByArticle = new Map(inputArticles.map((article) => [article.articleId, article]));
  let totalSections = 0;
  let totalBlocks = 0;

  const articles = asArray(parsed.articles).map((article, articleIndex) => {
    const inputArticle = inputByArticle.get(String(article.articleId)) || inputArticles[articleIndex] || inputArticles[0];
    const byId = new Map(inputArticle.sourceBlocks.map((block) => [block.id, block]));
    const knownIds = new Set(byId.keys());

    const sections = asArray(article.sections).map((section, sectionIndex) => {
      let sectionIds = coerceIdList(section.sourceBlockIds, knownIds);
      if (!sectionIds.length) sectionIds = findBlockIdsByText(section.sourceText, inputArticle.sourceBlocks);

      const blocks = asArray(section.blocks).map((block, blockIndex) => {
        let blockIds = coerceIdList(block.sourceBlockIds, knownIds);
        if (!blockIds.length) blockIds = findBlockIdsByText(block.sourceText, inputArticle.sourceBlocks, sectionIds);
        if (!blockIds.length) return null;

        const sourceText = normalizeText(block.sourceText) || sourceTextFromIds(blockIds, byId);
        const bullet = shortLabel(block.bullet || block.label || `Point ${blockIndex + 1}`);
        if (!sourceText || !bullet) return null;

        return {
          blockId: String(block.blockId || `${inputArticle.articleId}-s${sectionIndex + 1}-b${blockIndex + 1}`),
          bullet,
          sourceBlockIds: blockIds,
          sourceText,
        };
      }).filter(Boolean);

      if (!sectionIds.length) {
        sectionIds = [...new Set(blocks.flatMap((block) => block.sourceBlockIds))];
      }
      if (!sectionIds.length || !blocks.length) return null;

      totalSections += 1;
      totalBlocks += blocks.length;
      return {
        sectionId: String(section.sectionId || `${inputArticle.articleId}-s${sectionIndex + 1}`),
        title: shortLabel(section.title || `Section ${sectionIndex + 1}`, 8, 70),
        sourceBlockIds: sectionIds,
        sourceText: normalizeText(section.sourceText) || sourceTextFromIds(sectionIds, byId),
        blocks,
      };
    }).filter(Boolean);

    return {
      articleId: inputArticle.articleId,
      title: normalizeText(article.title) || inputArticle.title,
      sections,
    };
  }).filter((article) => article.sections.length);

  return {
    document: {
      title: normalizeText(parsed?.document?.title) || title,
    },
    articles,
    stats: {
      sections: totalSections,
      blocks: totalBlocks,
    },
  };
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
  if (!articles.length) return json({ error: "No readable article text was provided" }, 400);

  const sourceChars = articles.reduce((sum, article) => (
    sum + article.sourceBlocks.reduce((inner, block) => inner + block.text.length, 0)
  ), 0);
  if (sourceChars > MAX_SOURCE_CHARS) {
    return json({ error: "This PDF has too much extracted text for one AI request. Try a shorter PDF for now." }, 413);
  }

  const apiKey = ctx?.env?.BUTTERBASE_API_KEY;
  if (!apiKey) return json({ error: "Butterbase AI API key is not configured for this function" }, 500);

  const appId = ctx?.env?.BUTTERBASE_APP_ID || "app_jnnlkgx7ehdy";
  const model = normalizeText(body.model) || DEFAULT_MODEL;
  const response = await fetch(`${gatewayBase(ctx)}/v1/${appId}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 8000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(title, articles) },
      ],
    }),
  });

  const aiData = await response.json();
  if (!response.ok) {
    return json({
      error: aiData?.error?.message || aiData?.error || "Butterbase AI request failed",
      model,
    }, response.status);
  }

  try {
    const content = aiData?.choices?.[0]?.message?.content || aiData?.content || "";
    const parsed = extractJson(content);
    const result = normalizeModelResult(parsed, title, articles);
    if (!result.articles.length) return json({ error: "The model returned no usable source-linked structure", model }, 502);
    return json({ ...result, model, usage: aiData.usage || null });
  } catch (error) {
    return json({ error: error.message || "Could not parse model output", model }, 502);
  }
}
