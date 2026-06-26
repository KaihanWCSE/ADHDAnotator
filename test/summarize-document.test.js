import assert from "node:assert/strict";
import test from "node:test";

import handler from "../butterbase-functions/summarize-document.js";

const originalFetch = globalThis.fetch;

const TEST_CONTEXT = {
  env: {
    BUTTERBASE_API_KEY: "test-api-key",
    BUTTERBASE_APP_ID: "test-app",
    BUTTERBASE_API_URL: "https://api.test.example",
  },
};

const SENTENCES = [
  "Focused readers often need dense paragraphs divided into smaller meaning based chunks so the important idea stays visible.",
  "The annotator keeps the original PDF page on screen while replacing selected source passages with shorter labels.",
  "Each label remains connected to the exact original sentences so a reader can open the source whenever they need detail.",
  "The backend asks the AI for sentence ranges instead of rewritten source text because ranges are easier to verify.",
  "Strict validation prevents missing sentences, overlapping bullets, and labels that point outside their parent section.",
];

function sourcePayload(overrides = {}) {
  return {
    filename: "contract-test.pdf",
    title: "Contract Test",
    model: "test/model",
    articles: [
      {
        articleId: "pdf-article-1",
        title: "Contract Test",
        sourceBlocks: [
          {
            id: "block-1",
            order: 0,
            pageNumber: 1,
            kind: "paragraph",
            text: SENTENCES.join(" "),
          },
        ],
      },
    ],
    ...overrides,
  };
}

function requestWithJson(body) {
  return new Request("https://example.test/fn/summarize-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAiResult(result) {
  const aiCalls = [];
  const storageUploadRequests = [];
  const storageUploads = [];

  globalThis.fetch = async (url, init = {}) => {
    const urlText = String(url);

    if (urlText.endsWith("/chat/completions")) {
      aiCalls.push({
        url: urlText,
        request: JSON.parse(init.body),
      });

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(result),
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlText.endsWith("/storage/test-app/upload")) {
      const request = JSON.parse(init.body);
      storageUploadRequests.push({ url: urlText, request });
      return new Response(JSON.stringify({
        uploadUrl: `https://storage.test.example/upload/${storageUploadRequests.length}`,
        objectId: `debug-object-${storageUploadRequests.length}`,
        objectKey: request.filename,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlText.startsWith("https://storage.test.example/upload/")) {
      storageUploads.push({
        url: urlText,
        body: JSON.parse(init.body),
      });
      return new Response(null, { status: 200 });
    }

    throw new Error(`Unexpected fetch URL in test: ${urlText}`);
  };
  return { aiCalls, storageUploadRequests, storageUploads };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("valid sentence ranges rebuild exact source text", async () => {
  const mock = mockAiResult({
    d: "Contract Test",
    a: [
      {
        id: "pdf-article-1",
        t: "Contract Test",
        sec: [
          {
            t: "Reading Support Flow",
            r: [1, 3],
            b: [
              { l: "Chunk dense paragraphs", r: [1, 1] },
              { l: "Clickable source labels", r: [2, 3] },
            ],
          },
          {
            t: "Validation Rules",
            r: [4, 5],
            b: [
              { l: "Use sentence ranges", r: [4, 4] },
              { l: "Reject broken coverage", r: [5, 5] },
            ],
          },
        ],
      },
    ],
  });

  const response = await handler(requestWithJson(sourcePayload()), TEST_CONTEXT);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.model, "test/model");
  assert.equal(body.stats.sections, 2);
  assert.equal(body.stats.blocks, 4);
  assert.equal(mock.aiCalls.length, 1);
  assert.equal(mock.aiCalls[0].url, "https://api.test.example/v1/test-app/chat/completions");
  assert.equal(mock.aiCalls[0].request.model, "test/model");
  assert.equal(mock.storageUploadRequests.length, 1);
  assert.equal(mock.storageUploadRequests[0].request.contentType, "application/json");
  assert.match(mock.storageUploadRequests[0].request.filename, /^debug-ai-runs\/.+-success-test-model-contract-test\.json$/);
  assert.equal(mock.storageUploads.length, 1);
  assert.equal(mock.storageUploads[0].body.status, "success");
  assert.equal(mock.storageUploads[0].body.request.model, "test/model");
  assert.equal(mock.storageUploads[0].body.ai.parsed.d, "Contract Test");
  assert.equal(mock.storageUploads[0].body.backend.normalizedResult.stats.blocks, 4);
  assert.equal(mock.storageUploads[0].body.debug.apiKeyPrefix, undefined);
  assert.equal(body.debugCaptures, undefined);

  const [firstSection, secondSection] = body.articles[0].sections;
  assert.deepEqual(firstSection.sentenceRange, [1, 3]);
  assert.equal(firstSection.sourceText, SENTENCES.slice(0, 3).join(" "));
  assert.equal(firstSection.blocks[1].sourceText, SENTENCES.slice(1, 3).join(" "));
  assert.deepEqual(secondSection.blocks[1].sentenceRange, [5, 5]);
  assert.equal(secondSection.blocks[1].sourceText, SENTENCES[4]);
});

test("bullet ranges crossing source blocks keep one visible source link", async () => {
  const firstBlockSentences = [
    "First page paragraphs can continue a thought through several sentences while still belonging to the same explanation in the original document.",
    "The first source block still has enough sentence structure and enough words to pass the backend readability filter.",
    "A final sentence on the first block may lead into the next page without losing its connection to the previous idea.",
  ];
  const secondBlockSentences = [
    "The next source block may continue the same topic after a page boundary while occupying a different clickable region.",
    "Clickable popovers should not mix text from different page regions because that makes the source window misleading.",
    "Separate links keep each annotation anchored to its own source block while preserving the validated sentence coverage.",
  ];
  mockAiResult({
    d: "Cross Block Test",
    a: [
      {
        id: "pdf-article-1",
        t: "Cross Block Test",
        sec: [
          {
            t: "Cross Block Handling",
            r: [1, 6],
            b: [
              { l: "First block setup", r: [1, 2] },
              { l: "Boundary continuation", r: [3, 4] },
              { l: "Separate source links", r: [5, 6] },
            ],
          },
        ],
      },
    ],
  });

  const response = await handler(requestWithJson(sourcePayload({
    title: "Cross Block Test",
    articles: [
      {
        articleId: "pdf-article-1",
        title: "Cross Block Test",
        sourceBlocks: [
          {
            id: "block-1",
            order: 0,
            pageNumber: 1,
            kind: "paragraph",
            text: firstBlockSentences.join(" "),
          },
          {
            id: "block-2",
            order: 1,
            pageNumber: 2,
            kind: "paragraph",
            text: secondBlockSentences.join(" "),
          },
        ],
      },
    ],
  })), TEST_CONTEXT);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.stats.blocks, 3);
  const blocks = body.articles[0].sections[0].blocks;
  assert.deepEqual(blocks[1].sourceBlockIds, ["block-1", "block-2"]);
  assert.deepEqual(blocks[1].sentenceRange, [3, 4]);
  assert.equal(blocks[1].sourceText, `${firstBlockSentences[2]} ${secondBlockSentences[0]}`);
  assert.equal(blocks[1].bullet, "Boundary continuation");
});

test("overlapping bullet ranges are rejected", async () => {
  mockAiResult({
    d: "Contract Test",
    a: [
      {
        id: "pdf-article-1",
        sec: [
          {
            t: "Broken Bullets",
            r: [1, 5],
            b: [
              { l: "First range", r: [1, 3] },
              { l: "Second range", r: [3, 5] },
            ],
          },
        ],
      },
    ],
  });

  const response = await handler(requestWithJson(sourcePayload()), TEST_CONTEXT);
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.match(body.error, /overlaps sentence 3/);
  assert.equal(body.attempts[0].model, "test/model");
});

test("missing sentence coverage is rejected", async () => {
  mockAiResult({
    d: "Contract Test",
    a: [
      {
        id: "pdf-article-1",
        sec: [
          {
            t: "Incomplete Coverage",
            r: [1, 2],
            b: [
              { l: "Only early sentences", r: [1, 2] },
            ],
          },
          {
            t: "Later Coverage",
            r: [4, 5],
            b: [
              { l: "Skips sentence three", r: [4, 5] },
            ],
          },
        ],
      },
    ],
  });

  const response = await handler(requestWithJson(sourcePayload()), TEST_CONTEXT);
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.match(body.error, /missed sentence 3/);
});

test("short or header-only input is skipped without calling AI", async () => {
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("AI should not be called for skipped input");
  };

  const response = await handler(requestWithJson(sourcePayload({
    articles: [
      {
        articleId: "pdf-article-1",
        title: "Short Input",
        sourceBlocks: [
          { id: "heading", text: "Overview:", kind: "header" },
          { id: "short", text: "Too short. Not enough detail.", kind: "paragraph" },
        ],
      },
    ],
  })), TEST_CONTEXT);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.skipped, true);
  assert.equal(body.code, "not_enough_readable_text");
  assert.equal(fetchCalled, false);
});
