'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const ClaudePuppeteer = require('./claude-puppeteer');

const SUMMARIES_DIR = path.join(__dirname, 'summaries');

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

// ─── PDF generation ─────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSummaryHTML(result, language) {
  const isZh = language === 'zh';
  const L = {
    summary:   isZh ? '章节摘要' : 'Chapter Summary',
    takeaways: isZh ? '核心要点' : 'Key Takeaways',
    concepts:  isZh ? '核心概念' : 'Key Concepts',
    mindMap:   isZh ? '思维导图' : 'Mind Map',
    footer:    isZh ? '由 BookLens AI 生成' : 'Generated by BookLens AI',
  };

  const chaptersHTML = (result.chapters || []).map((ch, idx) => `
    <section class="chapter">
      <h2 class="chapter-title">
        <span class="ch-num">${idx + 1}</span>${esc(ch.title)}
      </h2>
      <div class="block">
        <h3>${L.summary}</h3>
        <p>${esc(ch.summary)}</p>
      </div>
      ${(ch.takeaways || []).length ? `
      <div class="block">
        <h3>${L.takeaways}</h3>
        <ul>${ch.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      </div>` : ''}
      ${(ch.concepts || []).length ? `
      <div class="block">
        <h3>${L.concepts}</h3>
        ${ch.concepts.map((c, i) => `
          <div class="concept">
            <span class="cn">${i + 1}</span>
            <div><strong>${esc(c.name)}</strong><p>${esc(c.explanation)}</p></div>
          </div>`).join('')}
      </div>` : ''}
    </section>`).join('');

  let mmHTML = '';
  if (result.mindMap && (result.mindMap.themes || []).length) {
    const rows = [`<div class="mm-root">${esc(result.mindMap.title || result.title)}</div>`];
    for (const theme of result.mindMap.themes) {
      rows.push(`<div class="mm-theme">▸ ${esc(theme.name)}</div>`);
      for (const ch of (theme.chapters || [])) {
        rows.push(`<div class="mm-ch">◦ ${esc(ch.name)}</div>`);
        for (const c of (ch.concepts || []))
          rows.push(`<div class="mm-con">· ${esc(c)}</div>`);
      }
    }
    mmHTML = `<section class="mm-section"><h2>${L.mindMap}</h2><div class="mm-tree">${rows.join('')}</div></section>`;
  }

  return `<!DOCTYPE html><html lang="${isZh ? 'zh-CN' : 'en'}"><head><meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=block');
  body{font-family:'Noto Sans SC','WenQuanYi Zen Hei','Liberation Serif',Georgia,serif;font-size:11pt;line-height:1.65;color:#1c1917;margin:0;padding:0}
  .wrap{padding:18mm 16mm}
  .hdr{border-bottom:2px solid #d97706;padding-bottom:10px;margin-bottom:22px}
  .hdr h1{font-size:24pt;font-weight:bold;color:#92400e;margin:0 0 5px}
  .hdr .author{font-size:12pt;color:#b45309;margin:0}
  .chapter{margin-bottom:26px;page-break-inside:avoid}
  .chapter+.chapter{border-top:1px solid #fde68a;padding-top:18px}
  .chapter-title{display:flex;align-items:center;gap:9px;font-size:13pt;color:#b45309;margin:0 0 11px}
  .ch-num{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#d97706;color:#fff;font-size:10pt;font-weight:bold;flex-shrink:0}
  .block{margin-bottom:10px}
  .block h3{font-size:9pt;color:#d97706;text-transform:uppercase;letter-spacing:.06em;margin:0 0 5px}
  .block p{margin:0;font-size:10pt}
  ul{margin:0;padding-left:1.2em}
  li{font-size:10pt;margin-bottom:2px}
  .concept{display:flex;gap:9px;margin-bottom:7px}
  .cn{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#fef3c7;color:#92400e;font-size:8pt;font-weight:bold;flex-shrink:0;margin-top:1px}
  .concept strong{font-size:10pt}
  .concept p{font-size:9pt;color:#57534e;margin:2px 0 0}
  .mm-section{margin-top:28px;page-break-before:always}
  .mm-section h2{font-size:15pt;color:#92400e;border-bottom:1px solid #d97706;padding-bottom:5px;margin-bottom:14px}
  .mm-tree{font-size:10pt}
  .mm-root{font-weight:bold;font-size:12pt;color:#92400e;margin-bottom:7px}
  .mm-theme{margin-left:14px;font-weight:bold;color:#b45309;margin-top:9px;margin-bottom:3px}
  .mm-ch{margin-left:28px;color:#292524;margin-bottom:2px}
  .mm-con{margin-left:42px;color:#57534e;font-size:9pt;margin-bottom:1px}
  .footer{margin-top:36px;text-align:center;font-size:8pt;color:#a8a29e;border-top:1px solid #fde68a;padding-top:7px}
</style></head><body><div class="wrap">
  <div class="hdr">
    <h1>${esc(result.title)}</h1>
    ${result.author ? `<p class="author">${esc(result.author)}</p>` : ''}
  </div>
  ${chaptersHTML}
  ${mmHTML}
  <div class="footer">${L.footer}</div>
</div></body></html>`;
}

async function saveSummaryPDF(result, language) {
  if (!fs.existsSync(SUMMARIES_DIR)) fs.mkdirSync(SUMMARIES_DIR, { recursive: true });

  const safeTitle = (result.title || 'summary')
    .replace(/[^\w\u4e00-\u9fa5]/g, '-').replace(/-+/g, '-').slice(0, 60);
  const suffix   = crypto.randomBytes(4).toString('hex');
  const filename = `${safeTitle}-${suffix}.pdf`;
  const filePath = path.join(SUMMARIES_DIR, filename);

  if (!_client || !_client.browser) throw new Error('Browser not available for PDF generation');

  const page = await _client.browser.newPage();
  try {
    // networkidle0: wait until ALL network requests finish (including WOFF2 font files).
    // document.fonts.ready: ensure the font-face swap has completed before rendering.
    await page.setContent(buildSummaryHTML(result, language), { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.pdf({ format: 'A4', printBackground: true });
    fs.writeFileSync(filePath, buf);
  } finally {
    await page.close().catch(() => {});
  }
  return filename;
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
    send('Asking Claude for chapter summaries and mind map...');
    // Single call returns chapters + mind map to avoid rate-limiting between requests.
    // NOTE: all prompt endings use plain ASCII so prompt.slice(-60) is ASCII-safe.
    const batchPrompt =
      `The book "${bookTitle}" by ${bookAuthor} is a well-known work. ` +
      (bookDescription ? `Here is a description: ${bookDescription}\n\n` : '') +
      `Return a single JSON object with exactly two keys: "chapters" and "mindMap". ` +
      `"chapters" is an array of up to 8 of the most important chapters. Each chapter element: ` +
      `{ "number": <int>, "title": <string>, "summary": <100 word prose>, ` +
      `"takeaways": <array of 5 strings each under 20 words>, ` +
      `"concepts": <array of 3 objects with keys "name" and "explanation" where explanation is under 30 words> }. ` +
      `"mindMap" has this exact shape: ` +
      `{ "title": "${bookTitle}", "themes": [{ "name": <string>, "chapters": [{ "name": <string>, "concepts": [<string>, ...] }] }] }. ` +
      `Include 2-3 themes, group chapters under themes, 2-3 concepts per chapter in mindMap. ` +
      `Do not use double-quote characters inside any string value. ` +
      `Return ONLY valid JSON. No markdown fences. No extra text.`;

    const raw = await ask(batchPrompt, language, (m) => send(m));
    const parsed = safeParse(raw);

    // Support both {chapters, mindMap} shape and bare array (graceful fallback)
    const chapterList = Array.isArray(parsed) ? parsed : (parsed.chapters || []);
    const mindMap = Array.isArray(parsed) ? null : (parsed.mindMap || null);

    const chapterResults = chapterList.map(c => ({
      title: `Chapter ${c.number}: ${c.title}`,
      summary: c.summary,
      takeaways: Array.isArray(c.takeaways) ? c.takeaways : [],
      concepts: Array.isArray(c.concepts) ? c.concepts : [],
    }));

    send('Done!');
    const result0 = { title: bookTitle, author: bookAuthor, chapters: chapterResults, mindMap };
    let pdfFilename = null;
    try {
      send('Saving PDF…');
      pdfFilename = await saveSummaryPDF(result0, language);
    } catch (e) { console.error('[BookLens] PDF save failed:', e.message); }
    return { ...result0, pdfFilename };
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

  // ── Mind map — built from extracted chapter data (no extra Claude call) ────
  send('Building mind map...');
  const themeSize = Math.ceil(chapterResults.length / 3);
  const themes = [];
  for (let i = 0; i < chapterResults.length; i += themeSize) {
    const slice = chapterResults.slice(i, i + themeSize);
    themes.push({
      name: `Part ${themes.length + 1}`,
      chapters: slice.map(ch => ({
        name: ch.title,
        concepts: ch.concepts.slice(0, 3).map(c => c.name || c),
      })),
    });
  }
  const mindMap = { title: bookTitle, themes };

  send('Done!');
  const result1 = { title: bookTitle, author: bookAuthor, chapters: chapterResults, mindMap };
  let pdfFilename = null;
  try {
    send('Saving PDF…');
    pdfFilename = await saveSummaryPDF(result1, language);
  } catch (e) { console.error('[BookLens] PDF save failed:', e.message); }
  return { ...result1, pdfFilename };
}

module.exports = { initClient, generateBookSummary, splitIntoChapters, saveSummaryPDF };
