'use strict';
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const pdfParse = require('pdf-parse');
const { initClient, generateBookSummary, splitIntoChapters } = require('./summarizer');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── SSE helper ─────────────────────────────────────────────────────────────
function setupSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  return send;
}

// ─── Open Library lookup ────────────────────────────────────────────────────
async function lookupBook(query) {
  const isISBN = /^[\d\-X]{10,17}$/.test(query.replace(/\s/g, ''));
  let title = query, author = '', description = '';

  try {
    if (isISBN) {
      const isbn = query.replace(/[\s\-]/g, '');
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=details&format=json`;
      const data = await fetch(url).then(r => r.json());
      const key = `ISBN:${isbn}`;
      if (data[key]) {
        const details = data[key].details || {};
        title = details.title || query;
        author = (details.authors || []).map(a => a.name).join(', ');
        description = details.description?.value || details.description || '';
      }
    } else {
      const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=1`;
      const data = await fetch(url).then(r => r.json());
      if (data.docs && data.docs.length > 0) {
        const doc = data.docs[0];
        title = doc.title || query;
        author = (doc.author_name || []).join(', ');
      }
    }
  } catch (e) {
    console.warn('Open Library lookup failed:', e.message);
  }

  return { title, author, description };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.post('/api/summarize', async (req, res) => {
  const send = setupSSE(res);
  const { query, language = 'en' } = req.body;

  if (!query || !query.trim()) {
    send({ type: 'error', message: 'Please enter a book title or ISBN.' });
    return res.end();
  }

  try {
    send({ type: 'status', message: 'Looking up book on Open Library…' });
    const bookInfo = await lookupBook(query.trim());

    send({ type: 'status', message: `Found: "${bookInfo.title}" — generating summaries…` });

    const result = await generateBookSummary(bookInfo, null, language, (msg) => {
      send({ type: 'status', message: msg });
    });

    send({ type: 'complete', result });
    res.end();
  } catch (err) {
    console.error('/api/summarize error:', err);
    send({ type: 'error', message: err.message || 'An error occurred.' });
    res.end();
  }
});

app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  const send = setupSSE(res);
  const language = req.body.language || 'en';

  if (!req.file) {
    send({ type: 'error', message: 'No file uploaded.' });
    return res.end();
  }

  try {
    send({ type: 'status', message: 'Parsing PDF…' });
    let parsed;
    try {
      parsed = await pdfParse(req.file.buffer);
    } catch (e) {
      send({ type: 'error', message: 'Could not parse PDF. It may be a scanned image without extractable text.' });
      return res.end();
    }

    const text = parsed.text;
    if (!text || text.trim().length < 100) {
      send({ type: 'error', message: 'No readable text found in this PDF. It may be a scanned image.' });
      return res.end();
    }

    send({ type: 'status', message: 'Detecting chapters…' });
    const chapters = splitIntoChapters(text);

    send({ type: 'status', message: `Found ${chapters.length} chapter(s) — starting summaries…` });

    const result = await generateBookSummary(null, chapters, language, (msg) => {
      send({ type: 'status', message: msg });
    });

    send({ type: 'complete', result });
    res.end();
  } catch (err) {
    console.error('/api/upload error:', err);
    send({ type: 'error', message: err.message || 'An error occurred.' });
    res.end();
  }
});

// ─── Claude readiness gate ───────────────────────────────────────────────────
let claudeReady = false;
let claudeError = null;

function requireClaude(req, res, next) {
  if (claudeReady) return next();
  const send = setupSSE(res);
  if (claudeError) {
    send({ type: 'error', message: `Claude.ai init failed: ${claudeError}` });
  } else {
    send({ type: 'error', message: 'Claude.ai is still starting up — please wait and try again in a few seconds.' });
  }
  res.end();
}

app.use('/api/summarize', requireClaude);
app.use('/api/upload', requireClaude);

// Status endpoint so the frontend can poll readiness
app.get('/api/ready', (_req, res) => {
  res.json({ ready: claudeReady, error: claudeError });
});

// ─── Start ───────────────────────────────────────────────────────────────────
async function start() {
  // Bind Express immediately so the browser can load the UI
  app.listen(PORT, () => {
    console.log(`\n[BookLens] 🚀 Server running at http://localhost:${PORT}`);
    console.log('[BookLens] Initializing Claude.ai browser client in background…\n');
  });

  // Init Puppeteer asynchronously — don't block the server
  initClient()
    .then(() => {
      claudeReady = true;
      console.log('[BookLens] ✅ Claude.ai ready — summarization enabled.');
    })
    .catch((err) => {
      claudeError = err.message;
      console.error('[BookLens] ❌ Claude.ai init failed:', err.message);
    });
}

start();
