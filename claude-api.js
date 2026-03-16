'use strict';
const Anthropic = require('@anthropic-ai/sdk');

class ClaudeAPI {
  constructor() {
    this.client = null;
    this.isReady = false;
  }

  async init() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    this.client = new Anthropic({ apiKey });
    this.isReady = true;
  }

  async sendMessage(prompt, onProgress) {
    if (!this.isReady) throw new Error('Claude API client not initialized');

    let fullText = '';

    const stream = await this.client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        fullText += chunk.delta.text;
        if (onProgress) onProgress(`Claude is responding… (~${fullText.length} chars so far)`);
      }
    }

    return fullText;
  }

  async close() {
    // no-op — HTTP client, nothing to tear down
  }
}

module.exports = ClaudeAPI;
