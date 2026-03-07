/**
 * Markdown IR Tests
 *
 * Tests for the Markdown Intermediate Representation parsing
 */

import { describe, it, expect } from 'vitest';
import {
  markdownToIR,
  markdownToIRWithMeta,
  chunkMarkdownIR,
} from '../ir.js';

describe('markdownToIR', () => {
  it('should parse plain text', () => {
    const ir = markdownToIR('Hello world');
    expect(ir.text).toBe('Hello world');
    expect(ir.styles).toHaveLength(0);
    expect(ir.links).toHaveLength(0);
  });

  it('should parse bold text', () => {
    const ir = markdownToIR('**bold**');
    expect(ir.text).toBe('bold');
    expect(ir.styles).toHaveLength(1);
    expect(ir.styles[0]).toMatchObject({
      start: 0,
      end: 4,
      style: 'bold',
    });
  });

  it('should parse italic text with *', () => {
    const ir = markdownToIR('*italic*');
    expect(ir.text).toBe('italic');
    expect(ir.styles).toHaveLength(1);
    expect(ir.styles[0]).toMatchObject({
      start: 0,
      end: 6,
      style: 'italic',
    });
  });

  it('should parse italic text with _', () => {
    const ir = markdownToIR('_italic_');
    expect(ir.text).toBe('italic');
    expect(ir.styles).toHaveLength(1);
    expect(ir.styles[0].style).toBe('italic');
  });

  it('should parse inline code', () => {
    const ir = markdownToIR('`code`');
    expect(ir.text).toBe('code');
    expect(ir.styles).toHaveLength(1);
    expect(ir.styles[0]).toMatchObject({
      start: 0,
      end: 4,
      style: 'code',
    });
  });

  it('should parse code blocks', () => {
    const ir = markdownToIR('```js\nconst x = 1\n```');
    expect(ir.text).toContain('const x = 1');
    expect(ir.styles).toHaveLength(1);
    expect(ir.styles[0].style).toBe('code_block');
  });

  it('should parse strikethrough', () => {
    const ir = markdownToIR('~~deleted~~');
    expect(ir.text).toBe('deleted');
    expect(ir.styles).toHaveLength(1);
    expect(ir.styles[0]).toMatchObject({
      start: 0,
      end: 7,
      style: 'strikethrough',
    });
  });

  it('should parse links', () => {
    const ir = markdownToIR('[text](https://example.com)');
    expect(ir.text).toBe('text');
    expect(ir.links).toHaveLength(1);
    expect(ir.links[0]).toMatchObject({
      start: 0,
      end: 4,
      href: 'https://example.com',
    });
  });

  it('should parse blockquotes', () => {
    const ir = markdownToIR('> quote');
    expect(ir.text).toBe('quote');
    expect(ir.styles).toHaveLength(1);
    expect(ir.styles[0].style).toBe('blockquote');
  });

  it('should parse bullet lists', () => {
    const ir = markdownToIR('- item 1\n- item 2');
    expect(ir.text).toContain('• item 1');
    expect(ir.text).toContain('• item 2');
  });

  it('should parse ordered lists', () => {
    const ir = markdownToIR('1. item 1\n2. item 2');
    expect(ir.text).toContain('1. item 1');
    expect(ir.text).toContain('2. item 2');
  });

  it('should parse nested bold and italic', () => {
    const ir = markdownToIR('***bold italic***');
    expect(ir.text).toBe('bold italic');
    // Should have both bold and italic styles
    expect(ir.styles.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse spoilers', () => {
    const ir = markdownToIR('||spoiler||', { enableSpoilers: true });
    expect(ir.text).toBe('spoiler');
    expect(ir.styles).toHaveLength(1);
    expect(ir.styles[0].style).toBe('spoiler');
  });

  it('should parse horizontal rules', () => {
    const ir = markdownToIR('---');
    expect(ir.text).toContain('───');
  });
});

describe('markdownToIRWithMeta', () => {
  it('should detect tables', () => {
    const markdown = '| A | B |\n|---|---|\n| 1 | 2 |';
    const result = markdownToIRWithMeta(markdown, { tableMode: 'bullets' });
    expect(result.hasTables).toBe(true);
  });

  it('should not detect tables when disabled', () => {
    const markdown = '| A | B |\n|---|---|\n| 1 | 2 |';
    const result = markdownToIRWithMeta(markdown, { tableMode: 'off' });
    expect(result.hasTables).toBe(false);
  });
});

describe('chunkMarkdownIR', () => {
  it('should return single chunk if under limit', () => {
    const ir = markdownToIR('Hello world');
    const chunks = chunkMarkdownIR(ir, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Hello world');
  });

  it('should split long text into multiple chunks', () => {
    const ir = markdownToIR('A'.repeat(100));
    const chunks = chunkMarkdownIR(ir, 30);
    expect(chunks.length).toBeGreaterThan(1);
    // Verify total length is preserved
    const totalLength = chunks.reduce((sum, c) => sum + c.text.length, 0);
    expect(totalLength).toBe(100);
  });

  it('should preserve styles when chunking', () => {
    const ir = markdownToIR('**bold** and *italic*');
    const chunks = chunkMarkdownIR(ir, 10);
    // Styles should be present in chunks
    for (const chunk of chunks) {
      expect(chunk.styles).toBeDefined();
    }
  });

  it('should preserve links when chunking', () => {
    const ir = markdownToIR('[link](https://example.com) text');
    const chunks = chunkMarkdownIR(ir, 10);
    for (const chunk of chunks) {
      expect(chunk.links).toBeDefined();
    }
  });

  it('should handle empty text', () => {
    const ir = markdownToIR('');
    const chunks = chunkMarkdownIR(ir, 100);
    expect(chunks).toHaveLength(0);
  });

  it('should handle limit of 0', () => {
    const ir = markdownToIR('test');
    const chunks = chunkMarkdownIR(ir, 0);
    expect(chunks).toHaveLength(1);
  });
});
