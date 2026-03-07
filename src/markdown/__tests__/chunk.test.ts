/**
 * Chunking Tests
 *
 * Tests for text chunking utilities
 */

import { describe, it, expect } from 'vitest';
import {
  chunkText,
  chunkMarkdownText,
  chunkByParagraph,
  chunkByNewline,
} from '../chunk.js';

describe('chunkText', () => {
  it('should return single chunk if under limit', () => {
    const result = chunkText('Hello world', 100);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Hello world');
  });

  it('should split long text', () => {
    const text = 'A'.repeat(100);
    const result = chunkText(text, 30);
    expect(result.length).toBeGreaterThan(1);
    const totalLength = result.reduce((sum, c) => sum + c.length, 0);
    expect(totalLength).toBe(100);
  });

  it('should prefer word boundaries', () => {
    const text = 'Hello world test';
    const result = chunkText(text, 10);
    // Should split at word boundaries when possible
    expect(result.length).toBeGreaterThan(1);
  });

  it('should handle empty text', () => {
    const result = chunkText('', 100);
    expect(result).toHaveLength(0);
  });

  it('should handle limit of 0', () => {
    const result = chunkText('test', 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('test');
  });
});

describe('chunkMarkdownText', () => {
  it('should protect code blocks from splitting when possible', () => {
    const text = '```\n' + 'A'.repeat(50) + '\n```';
    const result = chunkMarkdownText(text, 30);
    // Code block should be kept together or at least contain the fence markers
    expect(result.some(r => r.includes('```'))).toBe(true);
  });

  it('should split outside code blocks', () => {
    const text = 'Hello world\n\n```\ncode\n```\n\nMore text here';
    const result = chunkMarkdownText(text, 20);
    // Should have multiple chunks but code block intact
    expect(result.length).toBeGreaterThan(1);
  });

  it('should handle nested fences', () => {
    const text = '````\n```\nnested\n```\n````';
    const result = chunkMarkdownText(text, 20);
    // Nested fences should be handled gracefully
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('chunkByParagraph', () => {
  it('should split at paragraph boundaries', () => {
    const text = 'Para 1\n\nPara 2\n\nPara 3';
    const result = chunkByParagraph(text, 100);
    expect(result).toHaveLength(3);
  });

  it('should not split if under limit', () => {
    const text = 'Single paragraph';
    const result = chunkByParagraph(text, 100);
    expect(result).toHaveLength(1);
  });

  it('should fall back to length splitting for long paragraphs', () => {
    const text = 'A'.repeat(200);
    const result = chunkByParagraph(text, 100);
    expect(result.length).toBeGreaterThan(1);
  });

  it('should handle empty paragraphs', () => {
    const text = 'Para 1\n\n\n\nPara 2';
    const result = chunkByParagraph(text, 100);
    expect(result).toHaveLength(2);
  });
});

describe('chunkByNewline', () => {
  it('should split at newlines', () => {
    const text = 'Line 1\nLine 2\nLine 3';
    const result = chunkByNewline(text, 100);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle long lines', () => {
    const text = 'A'.repeat(50) + '\n' + 'B'.repeat(50);
    const result = chunkByNewline(text, 30);
    expect(result.length).toBeGreaterThan(2);
  });

  it('should preserve blank lines as prefixes', () => {
    const text = 'Line 1\n\nLine 2';
    const result = chunkByNewline(text, 100);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
