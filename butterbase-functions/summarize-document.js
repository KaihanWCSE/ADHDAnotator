const MODEL = "anthropic/claude-sonnet-4.5";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function countSentences(text) {
  return (String(text || "").match(/[.!?]+(?=\s|$)/g) || []).length;
}

function parseJsonFromText(text) {
  const cleaned = String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI response was not JSON");
  }
}

function orderedCoverageIsValid(originalText, chunks) {
  const source = normalizeText(originalText).toLowerCase();
  const joined = normalizeText(chunks.map((chunk) => chunk.sourceText).join(" ")).toLowerCase();
  if (joined === source) return true;

  let cursor = 0;
  for (const chunk of chunks) {
    const needle = normalizeText(chunk.sourceText).toLowerCase();
    if (!needle) return false;
    const next = source.indexOf(needle, cursor);
    if (next < 0) return false;
    cursor = next + needle.length;
  }

  const covered = normalizeText(chunks.map((chunk) => chunk.sourceText).join(" ")).length;
  return covered >= normalizeText(originalText).length * 0.97;
}

function safeFallbackChunk(item) {
  const firstSentence = normalizeText(item.text).split(/(?<=[.!?])\s+/)[0] || item.text;
  return {
    header: null,
    chunks: [{
      label: firstSentence.length > 72 ? `${firstSentence.slice(0, 69).trim()}...` : firstSentence,
      sourceText: item.text,
    }],
  };
}

function cleanAiPlan(plan, item) {
  const chunks = Array.isArray(plan?.chunks) ? plan.chunks : [];
  const cleanedChunks = chunks
    .map((chunk) => ({
      label: normalizeText(chunk?.label).replace(/^[-*\u2022]\s*/, ""),
      sourceText: normalizeText(chunk?.sourceText),
    }))
    .filter((chunk) => chunk.label && chunk.sourceText);

  const header = normalizeText(plan?.header);
  const cleaned = {
    header: header || null,
    chunks: cleanedChunks,
  };

  if (!cleaned.chunks.length || !orderedCoverageIsValid(item.text, cleaned.chunks)) {
    return null;
  }

  return cleaned;
}

async function callAi(ctx, item, attempt) {
  const apiUrl = ctx.env.BUTTERBASE_API_URL;
  const appId = ctx.env.BUTTERBASE_APP_ID;
  const apiKey = ctx.env.BUTTERBASE_API_KEY;
  if (!apiUrl || !appId || !apiKey) {
    throw new Error("Butterbase AI environment is not configured");
  }

  const systemPrompt = [
    "You transform dense educational paragraphs into clickable presentation notes.",
    "You must split the paragraph into semantic chunks, not sentence-by-sentence chunks.",
    "A semantic chunk may contain one sentence or multiple adjacent sentences when they support the same big point.",
    "Prefer 3 to 4 chunks for a normal paragraph. Do not create one chunk per sentence unless every sentence is truly a separate idea.",
    "Group examples, causes, explanations, outcomes, evidence, and same-phase events with the sentence that introduces the same idea.",
    "Every word of the original paragraph must belong to exactly one chunk.",
    "Chunks must appear in the same order as the original paragraph.",
    "Each chunk gets a concise bullet label.",
    "Use exact original text for sourceText. Do not paraphrase, correct, omit, or reorder sourceText.",
    "Return JSON only.",
  ].join(" ");

  const userPrompt = [
    "Split this paragraph by meaning, then summarize each chunk into a bullet label.",
    "Return this exact JSON shape:",
    "{\"header\": string|null, \"chunks\": [{\"label\": string, \"sourceText\": string}]}",
    "Rules:",
    "- header may be null if the paragraph is short/simple.",
    "- sourceText values must concatenate back to the full paragraph, allowing whitespace differences only.",
    "- Use fewer, larger idea chunks instead of sentence-by-sentence bullets; 3 to 4 chunks is usually right.",
    "- Do not leave out transition sentences, examples, or explanations.",
    "- If unsure whether two sentences belong together, keep them together.",
    attempt > 1 ? "- Previous response failed coverage validation. Be more literal with sourceText." : "",
    "",
    `Paragraph:\n${item.text}`,
  ].join("\n");

  const response = await fetch(`${apiUrl}/v1/${appId}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1800,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Butterbase AI request failed");
  }

  const content = data?.choices?.[0]?.message?.content;
  return parseJsonFromText(content);
}

async function makeSemanticPlan(ctx, item) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const plan = await callAi(ctx, item, attempt);
      const cleaned = cleanAiPlan(plan, item);
      if (cleaned) return cleaned;
    } catch (error) {
      console.warn(`semantic plan attempt ${attempt} failed for ${item.id}: ${error.message}`);
    }
  }
  return safeFallbackChunk(item);
}

function annotationFromItem(item, kind, label, originalText, index) {
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

export async function handler(req, ctx) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const pages = Array.isArray(body.pages) ? body.pages : [];
    const annotations = [];
    let summarizedParagraphs = 0;

    for (const page of pages) {
      const items = Array.isArray(page.items) ? page.items : [];
      for (const item of items) {
        if (item.kind !== "paragraph" || countSentences(item.text) <= 2 || normalizeText(item.text).length <= 180) {
          continue;
        }

        const plan = await makeSemanticPlan(ctx, item);
        let rowIndex = 0;
        if (plan.header) {
          annotations.push(annotationFromItem(item, "header", plan.header, "", rowIndex));
          rowIndex += 1;
        }

        plan.chunks.forEach((chunk) => {
          annotations.push(annotationFromItem(item, "bullet", chunk.label, chunk.sourceText, rowIndex));
          rowIndex += 1;
        });

        summarizedParagraphs += 1;
      }
    }

    return jsonResponse({
      document: {
        title: body.title || body.filename || "Annotated PDF",
        fileObjectId: body.fileObjectId || null,
      },
      annotations,
      stats: {
        pages: pages.length,
        summarizedParagraphs,
        annotations: annotations.length,
      },
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error.message || "Summarization failed" }, 500);
  }
}
