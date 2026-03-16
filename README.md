# BookLens 📖🔍

AI-powered book summarizer using Claude.ai — **no API key required**.

## How it works

BookLens uses Puppeteer to control a real Chrome/Chromium browser connected to your claude.ai account. You log in once; the session is saved. All summarization is powered by Claude running in your browser.

## Prerequisites

- Node.js 18+
- A free or paid [claude.ai](https://claude.ai) account
- Chrome/Chromium (Puppeteer downloads it automatically)

## Setup

```bash
git clone <repo>
cd booklens
npm install        # also downloads Chromium (~170 MB, one-time)
npm start
```

**First run:** A browser window opens to claude.ai. Log in with your account. BookLens saves your session and switches to headless mode automatically.

**Subsequent runs:** Fully headless — no browser window appears.

## Generate the app icon

```bash
npm run generate-icon   # creates public/bookLens.svg
```

## Features

- Title / ISBN lookup via Open Library
- PDF upload with chapter detection
- Chapter-by-chapter summaries (~300 words each)
- Key takeaways (5–8 bullets per chapter)
- Interactive D3.js mind map
- Export summary as PDF
- English / Chinese language toggle
- PWA installable (offline-capable)

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser opens but login fails | Delete `.claude-cookies.json` and restart |
| "Could not find Claude.ai text input" | Claude.ai may have updated their UI; open an issue |
| Slow responses | Normal — Puppeteer waits for Claude to finish typing |
| PDF has no text | The PDF is likely a scanned image; OCR is not supported |
