'use strict';
const ClaudePuppeteer = require('./claude-puppeteer');

let _client = null;

async function initClient() {
  _client = new ClaudePuppeteer();
  await _client.init();
}

function getClient() {
  if (!_client || !_client.isReady) throw new Error('Claude client not ready');
  return _client;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the first complete JSON object `{…}` or array `[…]` from text.
 * Uses bracket-depth counting so it stops at the correct closing bracket.
 */
function extractJson(text) {
  const open = text.search(/[\[{]/);
  if (open === -1) return null;
  const opener = text[open];
  const closer = opener === '[' ? ']' : '}';
  let depth = 0, inStr = false, esc = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (esc)               { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"')        { inStr = !inStr; continue; }
    if (inStr)             { continue; }
    if (ch === opener || ch === (opener === '[' ? '{' : '[')) depth++;
    if (ch === closer || ch === (closer === ']' ? '}' : ']')) {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * Sanitize a JSON string to fix the most common LLM output issues:
 *  - Normalize Unicode/curly quotes to ASCII equivalents
 *  - Escape unescaped " inside string values using lookahead heuristic
 *  - Escape literal newlines/tabs/control chars inside string values
 */
function sanitizeJson(raw) {
  // Step 1: normalize all Unicode quote variants to ASCII
  let s = raw
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");

  // Step 2: context-aware fix of string value contents
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '"') { out += s[i++]; continue; }

    // Opening delimiter of a JSON string
    out += '"';
    i++;

    while (i < s.length) {
      const c = s[i];

      if (c === '\\') {
        // Already-escaped sequence: copy two chars verbatim
        out += c; i++;
        if (i < s.length) { out += s[i]; i++; }
        continue;
      }

      if (c === '"') {
        // Is this the closing delimiter or an unescaped inner quote?
        // Look past whitespace for a JSON structural character.
        let j = i + 1;
        while (j < s.length && /\s/.test(s[j])) j++;
        const next = s[j] ?? '';
        if (':,}]'.includes(next) || j >= s.length) {
          out += '"'; i++; break; // closing delimiter
        } else {
          out += '\\"'; i++;      // inner quote – escape it
        }
        continue;
      }

      // Escape control characters that are illegal inside JSON strings
      const code = c.charCodeAt(0);
      if (code === 0x0A) { out += '\\n';  i++; continue; }
      if (code === 0x0D) { out += '\\r';  i++; continue; }
      if (code === 0x09) { out += '\\t';  i++; continue; }
      if (code < 0x20)   { out += ' ';   i++; continue; }

      out += c; i++;
    }
  }
  return out;
}

/**
 * Parse JSON from a raw LLM response, with two-pass fallback:
 *  1. extractJson → JSON.parse
 *  2. extractJson → sanitizeJson → JSON.parse
 */
function safeParse(raw) {
  const extracted = extractJson(raw) ?? raw;
  try {
    return JSON.parse(extracted);
  } catch {
    try {
      return JSON.parse(sanitizeJson(extracted));
    } catch (e) {
      throw new Error(`JSON parse failed: ${e.message}. Preview: ${extracted.slice(0, 120)}`);
    }
  }
}

function langPrefix(language) {
  return language === 'zh'
    ? 'Respond entirely in Chinese (Chinese characters only). '
    : 'Respond entirely in English only. ';
}

async function ask(prompt, language, onProgress) {
  const client = getClient();
  return client.sendMessage(langPrefix(language) + prompt, onProgress);
}

// ─── chapter splitting ──────────────────────────────────────────────────────

function splitIntoChapters(text) {
  const patterns = [
    /^(chapter\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)[\s\.:—-]*[^\n]*)/gim,
    /^(part\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five)[\s\.:—-]*[^\n]*)/gim,
  ];

  let splits = [];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      splits.push({ index: m.index, title: m[1].trim() });
    }
    if (splits.length >= 2) break;
  }

  if (splits.length < 2) {
    const words = text.split(/\s+/);
    const segSize = Math.ceil(words.length / Math.min(10, Math.ceil(words.length / 3000)));
    const segments = [];
    for (let i = 0; i < words.length; i += segSize) {
      segments.push({
        title: `Section ${segments.length + 1}`,
        text: words.slice(i, i + segSize).join(' '),
      });
    }
    return segments.slice(0, 10);
  }

  return splits.map((s, i) => {
    const start = s.index;
    const end = i + 1 < splits.length ? splits[i + 1].index : text.length;
    return { title: s.title, text: text.slice(start, end).trim() };
  });
}

// ─── main entry ─────────────────────────────────────────────────────────────

async function generateBookSummary(bookInfo, chapters, language, onProgress) {
  const send = (msg) => onProgress && onProgress(msg);

  let bookTitle = bookInfo?.title || 'Uploaded Book';
  let bookAuthor = bookInfo?.author || 'Unknown Author';
  const bookDescription = bookInfo?.description || '';
  const fromPDF = !!chapters;

  // ── ISBN/title path ───────────────────────────────────────────────────────
  if (!fromPDF) {
    send('Asking Claude for all chapter summaries...');
    // NOTE: all prompt endings use plain ASCII (no en/em dashes) so that
    // prompt.slice(-60) stays ASCII-safe for the Puppeteer tail-search.
    // Capped at 10 chapters to stay within Claude output token budget.
    const batchPrompt =
      `The book "${bookTitle}" by ${bookAuthor} is a well-known work. ` +
      (bookDescription ? `Here is a description: ${bookDescription}\n\n` : '') +
      `Return a JSON array of the most important chapters (up to 10). Each element must have: ` +
      `{ "number": <int>, "title": <string>, "summary": <120 word prose summary>, ` +
      `"takeaways": <array of exactly 5 strings each under 25 words>, ` +
      `"concepts": <array of exactly 4 objects with keys "name" and "explanation" where explanation is under 35 words> }. ` +
      `Do not use double-quote characters inside any string value. ` +
      `Return ONLY valid JSON. No markdown fences. No extra text.`;

    const raw = await ask(batchPrompt, language, (m) => send(m));
    const chapterList = safeParse(raw);

    const chapterResults = chapterList.map(c => ({
      title: `Chapter ${c.number}: ${c.title}`,
      summary: c.summary,
      takeaways: Array.isArray(c.takeaways) ? c.takeaways : [],
      concepts: Array.isArray(c.concepts) ? c.concepts : [],
    }));

    // ── Mind map ─────────────────────────────────────────────────────────────
    send('Building mind map...');
    // NOTE: "2-4" and "3-5" use plain hyphens (not en dashes) intentionally.
    const mindMapPrompt =
      `For the book "${bookTitle}" by ${bookAuthor}, generate a mind-map as JSON with this exact shape: ` +
      `{"title":"${bookTitle}","themes":[{"name":"Theme Name","chapters":[{"name":"Chapter Name","concepts":["concept1","concept2","concept3"]}]}]} ` +
      `Include 2-4 themes, group actual chapters under relevant themes, 3-5 concepts per chapter. ` +
      `Do not use double-quote characters inside any string value. ` +
      `Return ONLY valid JSON. No other text.`;

    const mindMapRaw = await ask(mindMapPrompt, language, (m) => send(m));
    const mindMap = safeParse(mindMapRaw);

    send('Done!');
    return { title: bookTitle, author: bookAuthor, chapters: chapterResults, mindMap };
  }

  // ── PDF path ──────────────────────────────────────────────────────────────
  const chapterResults = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    send(`Summarizing ${ch.title} (${i + 1}/${chapters.length})...`);

    const combinedPrompt =
      `Here is the chapter text:\n\n${ch.text.slice(0, 8000)}\n\n` +
      `Return JSON with keys: "summary" (300 word prose), "takeaways" (array of 5-8 strings each under 40 words), ` +
      `"concepts" (array of exactly 4 objects with keys "name" and "explanation" where explanation is under 35 words). ` +
      `Do not use double-quote characters inside any string value. ` +
      `Return ONLY valid JSON. No markdown fences. No extra text.`;

    const raw = await ask(combinedPrompt, language, (m) => send(m));
    const parsed = safeParse(raw);

    chapterResults.push({
      title: ch.title,
      summary: parsed.summary,
      takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
      concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
    });
  }

  // ── Mind map ─────────────────────────────────────────────────────────────
  send('Building mind map...');
  const mindMapPrompt =
    `For the book "${bookTitle}" by ${bookAuthor}, generate a mind-map as JSON with this exact shape: ` +
    `{"title":"${bookTitle}","themes":[{"name":"Theme Name","chapters":[{"name":"Chapter Name","concepts":["concept1","concept2","concept3"]}]}]} ` +
    `Include 2-4 themes, group actual chapters under relevant themes, 3-5 concepts per chapter. ` +
    `Do not use double-quote characters inside any string value. ` +
    `Return ONLY valid JSON. No other text.`;

  const mindMapRaw = await ask(mindMapPrompt, language, (m) => send(m));
  const mindMap = safeParse(mindMapRaw);

  send('Done!');
  return { title: bookTitle, author: bookAuthor, chapters: chapterResults, mindMap };
}

module.exports = { initClient, generateBookSummary, splitIntoChapters };
