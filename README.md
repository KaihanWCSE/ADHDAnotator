# ADHDAnotator

ADHD Anotator is a Butterbase-hosted PDF reading tool that turns uploaded PDF text into ADHD-friendly section titles and clickable bullet summaries.

## Current Architecture

- Static frontend: `index.html`, `styles.css`, and `app.js`
- PDF parsing: PDF.js runs in the browser and extracts text blocks from user-uploaded PDFs
- AI backend: Butterbase functions in `butterbase-functions/`
  - `list-ai-models` returns a compact list of recommended chat models
  - `summarize-document` sends extracted article blocks to the selected Butterbase AI model
- Rendering: the frontend places section titles and bullet summaries back onto the PDF preview; each bullet opens its exact source text

## Deployment

The frontend is deployed as a static Butterbase site:

```text
https://pdf-annotator-ai.butterbase.dev
```
