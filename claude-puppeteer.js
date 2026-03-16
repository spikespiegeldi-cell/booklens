'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, '.claude-cookies.json');
const CLAUDE_URL = 'https://claude.ai';

// Matches Puppeteer errors thrown when a frame/target is gone mid-operation,
// OR when the entire browser process has crashed / CDP connection was closed.
const DETACH_RE = /detach|destroyed|Target closed|Session closed|context was destroyed|Protocol error|Connection closed/i;

class ClaudePuppeteer {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isReady = false;
    // All sendMessage calls are chained onto this promise so they never
    // run concurrently (two requests sharing one page would corrupt both).
    this._queue = Promise.resolve();
  }

  // ─── launch helpers ────────────────────────────────────────────────────────

  async _launchBrowser(headless) {
    return puppeteer.launch({
      headless,
      // Use system Chromium when deployed via Docker (set PUPPETEER_EXECUTABLE_PATH)
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--window-size=1280,800',
        // Low-memory flags for Docker / Railway (512 MB container)
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--mute-audio',
      ],
      defaultViewport: { width: 1280, height: 800 },
    });
  }

  async _newPage(browser) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    return page;
  }

  // ─── cookies ───────────────────────────────────────────────────────────────

  async _loadCookies(page) {
    if (!fs.existsSync(COOKIES_PATH)) return false;
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await page.setCookie(...cookies);
      return true;
    } catch {
      return false;
    }
  }

  async _saveCookies(page) {
    try {
      const cookies = await page.cookies();
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    } catch { /* ignore if page is gone */ }
  }

  // ─── login detection ───────────────────────────────────────────────────────

  async _isLoggedIn(page) {
    try {
      const url = page.url();
      if (url.includes('/login') || url.includes('/auth')) return false;
      await page.waitForFunction(
        () => document.readyState === 'complete',
        { timeout: 5000 }
      );
      const finalUrl = page.url();
      return !finalUrl.includes('/login') && !finalUrl.includes('/auth') && finalUrl.includes('claude.ai');
    } catch {
      return false;
    }
  }

  // ─── public init ───────────────────────────────────────────────────────────

  async init() {
    // ── Bootstrap cookies from env var (production / Docker deployment) ──────
    // To deploy without a visible browser: run locally once to log in, then:
    //   base64 < .claude-cookies.json   (macOS: base64 -i .claude-cookies.json)
    // Paste the output as the CLAUDE_COOKIES environment variable on your host.
    if (process.env.CLAUDE_COOKIES && !fs.existsSync(COOKIES_PATH)) {
      try {
        const decoded = Buffer.from(process.env.CLAUDE_COOKIES, 'base64').toString('utf-8');
        fs.writeFileSync(COOKIES_PATH, decoded);
        console.log('[BookLens] Loaded session cookies from CLAUDE_COOKIES env var.');
      } catch (e) {
        console.warn('[BookLens] Failed to decode CLAUDE_COOKIES:', e.message);
      }
    }

    // ── Try headless with saved cookies ──────────────────────────────────────
    if (fs.existsSync(COOKIES_PATH)) {
      try {
        console.log('[BookLens] Trying saved session (headless)...');
        const browser = await this._launchBrowser('new');
        const page = await this._newPage(browser);
        await this._loadCookies(page);
        await page.goto(CLAUDE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        if (await this._isLoggedIn(page)) {
          this.browser = browser;
          this.page = page;
          this.isReady = true;
          console.log('[BookLens] ✅ Connected to Claude.ai (headless)');
          return;
        }

        await browser.close();
        console.log('[BookLens] Saved session expired.');
      } catch (e) {
        console.log('[BookLens] Headless attempt failed:', e.message);
      }
    }

    // ── Production: no cookies / expired → fail with a clear message ─────────
    // Can't open a visible browser on a remote server.
    if (process.env.NODE_ENV === 'production' || process.env.CLAUDE_COOKIES) {
      throw new Error(
        'No valid Claude.ai session. ' +
        'Log in locally (npm start), then set CLAUDE_COOKIES=' +
        '$(base64 -i .claude-cookies.json) on the server.'
      );
    }

    // ── Local dev: open a visible browser so the user can log in ─────────────
    console.log('\n' + '═'.repeat(60));
    console.log(' 🔐  BookLens needs you to log in to Claude.ai');
    console.log('     A browser window will open. Log in, then come');
    console.log('     back here — the app continues automatically.');
    console.log('═'.repeat(60) + '\n');

    const browser = await this._launchBrowser(false);
    const page = await this._newPage(browser);
    await this._loadCookies(page);
    await page.goto(CLAUDE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    if (!(await this._isLoggedIn(page))) {
      await page.waitForFunction(
        () => {
          const url = window.location.href;
          return url.includes('claude.ai') &&
                 !url.includes('/login') &&
                 !url.includes('/auth') &&
                 document.body.innerText.trim().length > 200;
        },
        { timeout: 300_000, polling: 1500 }
      );
    }

    await this._saveCookies(page);
    console.log('[BookLens] ✅ Logged in — session saved.');
    await browser.close();

    const hBrowser = await this._launchBrowser('new');
    const hPage = await this._newPage(hBrowser);
    await this._loadCookies(hPage);
    await hPage.goto(CLAUDE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    this.browser = hBrowser;
    this.page = hPage;
    this.isReady = true;
    console.log('[BookLens] ✅ Running headless.');
  }

  // ─── request serialisation ─────────────────────────────────────────────────
  // Public entry point: enqueues the call so concurrent requests are handled
  // one at a time (they share a single Puppeteer page).

  sendMessage(prompt, onProgress) {
    if (!this.isReady) throw new Error('ClaudePuppeteer not initialized');
    // Chain onto the queue; each call waits for the previous to finish.
    // Errors do NOT break the queue — the next request can still proceed.
    const task = this._queue
      .then(() => this._sendWithRetry(prompt, onProgress))
      .catch((err) => { throw err; });
    this._queue = task.catch(() => {}); // swallow so queue never breaks
    return task;
  }

  // ─── retry wrapper ─────────────────────────────────────────────────────────

  async _sendWithRetry(prompt, onProgress) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await this._doSendMessage(prompt, onProgress);
      } catch (e) {
        if (attempt === 2 || !DETACH_RE.test(e.message)) throw e;
        console.log(`[BookLens] Frame detached on attempt ${attempt} — opening fresh page...`);
        await this._resetPage();
        await this._sleep(1000);
      }
    }
  }

  // ─── page reset ────────────────────────────────────────────────────────────

  async _resetPage() {
    try { await this.page.close(); } catch { /* ignore if already gone */ }

    try {
      this.page = await this._newPage(this.browser);
      console.log('[BookLens] Fresh page opened for retry.');
    } catch {
      console.log('[BookLens] Browser connection lost — relaunching browser…');
      try { await this.browser.close(); } catch { /* already gone */ }
      this.browser = await this._launchBrowser('new');
      this.page = await this._newPage(this.browser);
      console.log('[BookLens] Browser relaunched successfully.');
    }

    await this._loadCookies(this.page);
  }

  // ─── core send ─────────────────────────────────────────────────────────────

  async _doSendMessage(prompt, onProgress) {
    const page = this.page;

    // Navigate to about:blank first to unload the previous response DOM
    // (which can be 20K+ chars), freeing memory before loading the next chat.
    // We reuse the same page so the SPA session/auth state is preserved.
    try { await page.goto('about:blank', { timeout: 5000 }); } catch { /* ignore */ }

    await page.goto(`${CLAUDE_URL}/new`, { waitUntil: 'networkidle2', timeout: 30000 });
    await this._sleep(1500);

    const landedUrl = page.url();
    if (landedUrl.includes('/login') || landedUrl.includes('/auth')) {
      throw new Error(`Session expired — redirected to ${landedUrl}`);
    }

    // ── Find input area ───────────────────────────────────────────────────────
    const inputSelectors = ['div[contenteditable="true"]', '.ProseMirror', 'textarea'];
    let inputEl = null;
    for (const sel of inputSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 8000 });
        inputEl = await page.$(sel);
        if (inputEl) break;
      } catch { /* try next */ }
    }
    if (!inputEl) throw new Error('Could not find Claude.ai text input — page may have changed.');

    // Focus + clear
    await page.evaluate((el) => {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }, inputEl).catch(() => {});
    await page.keyboard.press('Backspace');

    // Insert prompt via execCommand (fires ProseMirror input handlers)
    const CHUNK = 500;
    for (let i = 0; i < prompt.length; i += CHUNK) {
      await page.evaluate((chunk) => {
        document.execCommand('insertText', false, chunk);
      }, prompt.slice(i, i + CHUNK));
    }
    await this._sleep(500);

    const startUrl = page.url();

    // Dismiss cookie consent overlay if present
    try {
      const consentBtn = await page.$('[data-testid="consent-accept"]');
      if (consentBtn) {
        await consentBtn.click();
        await this._sleep(500);
        await this._saveCookies(page);
      }
    } catch { /* overlay may not be present */ }

    // Submit
    const submitResult = await page.evaluate(() => {
      const btn = document.querySelector(
        'button[aria-label="Send message"], button[aria-label="Send Message"]'
      );
      if (!btn) return 'no-button';
      if (btn.disabled) return 'disabled';
      btn.click();
      return 'clicked';
    }).catch(() => 'error');

    console.log(`[BookLens] Submit result: ${submitResult}`);
    if (submitResult !== 'clicked') {
      console.log('[BookLens] Falling back to keyboard Enter');
      await page.keyboard.press('Enter');
    }

    // Wait for URL to change (SPA navigation to /chat/…)
    const urlDeadline = Date.now() + 15_000;
    while (Date.now() < urlDeadline) {
      await this._sleep(300);
      if (page.url() !== startUrl) break;
    }

    await this._sleep(1500);

    let chatPreLen = 0;
    for (let i = 0; i < 6; i++) {
      try {
        chatPreLen = await page.evaluate(() => document.body.innerText.length);
        break;
      } catch (e) {
        if (i === 5) throw e;
        await this._sleep(500);
      }
    }

    return this._waitForStableResponse(page, onProgress, chatPreLen, prompt);
  }

  async _waitForStableResponse(page, onProgress, chatPreLen, prompt) {
    const MAX_WAIT_MS = 180_000, POLL_MS = 1_000, STABLE_NEEDED = 3;
    const startThreshold = chatPreLen + 50;
    let prevLen = chatPreLen, stableCount = 0, elapsed = 0, responseStarted = false;

    while (elapsed < MAX_WAIT_MS) {
      await this._sleep(POLL_MS);
      elapsed += POLL_MS;

      let currentLen;
      try {
        currentLen = await page.evaluate(() => document.body.innerText.length);
      } catch { continue; }

      if (!responseStarted) {
        if (currentLen >= startThreshold) responseStarted = true;
        prevLen = currentLen;
        continue;
      }

      if (currentLen === prevLen) {
        if (++stableCount >= STABLE_NEEDED) {
          let fullText;
          try {
            fullText = await page.evaluate(() => document.body.innerText);
          } catch { stableCount = 0; continue; }

          const tail = prompt.slice(-60);
          const tailIdx = fullText.lastIndexOf(tail);
          if (tailIdx !== -1) return fullText.slice(tailIdx + tail.length).trim();

          const responseLen = prevLen - chatPreLen;
          if (responseLen > 50) return fullText.slice(-(responseLen + 100)).trim();

          return fullText.slice(chatPreLen).trim();
        }
      } else {
        stableCount = 0;
        if (onProgress) onProgress(`Claude is responding... (~${Math.max(0, currentLen - startThreshold)} chars so far)`);
      }
      prevLen = currentLen;
    }

    try {
      const fullText = await page.evaluate(() => document.body.innerText);
      const tail = prompt.slice(-60);
      const idx = fullText.lastIndexOf(tail);
      if (idx !== -1) {
        const candidate = fullText.slice(idx + tail.length).trim();
        if (candidate.length > 50) return candidate;
      }
    } catch { /* nothing left to try */ }

    throw new Error('Claude.ai response timed out after 3 minutes');
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}

module.exports = ClaudePuppeteer;
