# Codex Handoff

Project: ADHD Annotator / PDF Annotator AI
Repo: https://github.com/KaihanWCSE/ADHDAnotator.git
Local path: `D:\Projects\adhdanotator`
Live app: https://pdf-annotator-ai.butterbase.dev
Butterbase app id: `app_jnnlkgx7ehdy`

## Structure

- `index.html`, `styles.css`, `app.js`: static frontend deployed to Butterbase.
- `app.js`: browser PDF pipeline. It loads PDF.js, extracts spans/lines/blocks, filters summarizable source blocks, calls the backend, renders PDF pages to canvas, clears source regions, draws blue AI headers and red AI bullets, and overlays invisible clickable annotation buttons.
- `butterbase-functions/summarize-document/`: backend summarization function. It receives extracted source blocks, filters unsafe/short content again, sends numbered sentences to Butterbase AI, validates sentence ranges, and returns source-linked sections/bullets.
- `butterbase-functions/list-ai-models/`: model picker endpoint.
- `test/summarize-document.test.js`: backend contract tests, run with `npm test`.

## Current State

- Current work is focused on PDF text detection, especially excluding callout/example/gray-box text while keeping real large paragraphs.
- The intended inclusion model is: split extracted lines at obvious boundaries, group nearby paragraph text, then summarize only groups with at least 40 words and at least 3 sentences.
- Avoid hardcoded label-word exclusions. Prefer geometry/visual signals: background change, text color change, font size/style/weight change, table-like layout, short-label-line density, numeric-symbol density, and line spacing.
- A debug build is currently deployed with visual sampling overlays enabled:
  - Green: kept lines
  - Amber: header/label boundary lines
  - Pink: visual outlier lines
  - Purple: visual boundary/new visual block
  - Gray: table-like lines
  - Cyan: exact per-span pixel sample boxes

## Known Bug

On `testWithTable.pdf`, gray-box/callout text is still leaking into summaries, for example `Core idea...` and `Examples...` bullets. The same run also detects too few text blocks overall, currently about 2 blocks for a 4-page PDF, leaving page 4 mostly untransformed.

The likely problem is that `sampleTextVisualStyle()` samples very tight rectangles around PDF text spans, so the measured background may not represent the visual callout box. The next useful step is to inspect the deployed overlay and then improve sampling to use wider line bands / local background regions, with the main page background derived from strong paragraph candidates instead of all non-table lines.
