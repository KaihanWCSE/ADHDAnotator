# Codex Handoff

Use this file to resume work on ADHD Annotator after reinstalling Codex or starting a new chat.

## Project

- Name: ADHD Annotator
- Repo: https://github.com/KaihanWCSE/ADHDAnotator.git
- Local path: `C:\Users\Kai's Desktop\Documents\ADHD Anotator`
- Live URL: https://pdf-annotator-ai.butterbase.dev
- Butterbase app id: `app_jnnlkgx7ehdy`
- Current branch: `main`
- Latest known pushed commit: `89b343b Optimize AI summaries with sentence ranges`

## Current Architecture

- Static frontend: `index.html`, `styles.css`, `app.js`
- PDF parsing: PDF.js runs in the browser and extracts selectable text, coordinates, font metadata, lines, blocks, and spans.
- Backend: Butterbase serverless functions in `butterbase-functions/`
- AI: Butterbase AI Gateway chat completions endpoint.
- Rendering: the frontend renders original PDF pages to canvas, erases selected original text spans, draws section headers and bullet summaries, and overlays clickable invisible buttons for source popovers.

## Current Backend Endpoints

- `GET /fn/list-ai-models`
  - Lists curated Butterbase AI chat models for the model picker.
  - Preferred models:
    - `openai/gpt-4.1-mini`
    - `google/gemini-3.1-flash-lite`
    - `anthropic/claude-sonnet-4.6`
    - `anthropic/claude-opus-4.7`

- `POST /fn/summarize-document`
  - Receives extracted PDF text blocks from the browser.
  - Filters headers, page numbers, short blocks, and non-long-form text.
  - Splits remaining content into numbered sentences.
  - Sends numbered sentences only to the selected LLM.
  - Requires compact JSON with section ranges and bullet ranges.
  - Validates every sentence is covered exactly once by sections and bullets.
  - Reconstructs exact source text locally from sentence ranges.
  - Retries with `google/gemini-3.1-flash-lite` if default `openai/gpt-4.1-mini` fails.

## Important Current Logic

- Frontend skips summarizing blocks with fewer than 3 sentences or fewer than 40 words.
- Backend repeats the same filtering for safety.
- `isLikelyHeaderBlock()` identifies numeric section labels, page markers, title-like short lines, colon headers, and emphasized short headers.
- Expected skip cases return HTTP 200 with `{ skipped: true }` so Butterbase does not send failure emails.
- The PDF file itself is not currently uploaded during the active transform path; the browser parses the PDF locally and sends extracted text to Butterbase.
- `uploadPdf()` and the old storage path exist in `app.js`, but `processCurrentPdf()` currently does not call it.

## Main Product Flow

1. User uploads/selects a PDF.
2. Browser loads PDF.js.
3. Browser extracts text spans from every page.
4. Text spans are grouped into lines and then source blocks.
5. Header-like and short blocks are skipped.
6. User chooses an AI model.
7. Frontend calls `POST /fn/summarize-document`.
8. Backend sends numbered sentences to Butterbase AI.
9. LLM returns section titles, section sentence ranges, bullet labels, and bullet sentence ranges.
10. Backend validates ranges and rebuilds exact source text locally.
11. Frontend converts the result into annotations.
12. PDF pages are rendered to canvas.
13. Original source spans are erased.
14. Blue headers and red clickable bullets are drawn.
15. Clicking a bullet opens a popover with exact original text.

## Known Constraints

- Works best with selectable-text PDFs.
- Scanned/image-only PDFs need OCR later.
- Complex multi-column layouts, tables, or unusual PDF fonts can still confuse extraction.
- There is no saved document history yet.
- There are no formal automated tests yet.
- Butterbase credentials and API keys should stay outside the repo.

## Good Next Steps

1. Decide whether to fully use Butterbase Storage for uploaded PDFs or remove the inactive storage path.
2. Add persistence for processed summaries so users can reopen a PDF without paying for another LLM call.
3. Add a lightweight regression test for the sentence-range summarization contract.
4. Improve multi-column/table detection.
5. Add OCR for scanned PDFs.

## Resume Summary

Built a 1st-place hackathon PDF reading tool that converts dense academic PDF paragraphs into ADHD-friendly clickable bullet annotations. Implemented a browser PDF.js extraction pipeline, Butterbase serverless functions, model selection, compact sentence-range LLM prompting, strict coverage validation, fallback model retry, local source reconstruction, and canvas-based annotation rendering.
