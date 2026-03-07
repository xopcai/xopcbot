/**
 * Format Tests - Table Support
 *
 * Tests for table rendering with different modes
 */

import { describe, it, expect } from 'vitest';
import { markdownToTelegramHtml, markdownToTelegramChunks } from '../format.js';

describe('table rendering', () => {
  it('should render tables with bullets mode', () => {
    const markdown = `| Header1 | Header2 |
|--------|---------|
| Cell1  | Cell2   |`;
    
    const html = markdownToTelegramHtml(markdown, { 
      tableMode: 'bullets' 
    });
    
    // Should contain bullet points
    expect(html).toContain('•');
  });

  it('should render tables with code mode', () => {
    const markdown = `| Header1 | Header2 |
|--------|---------|
| Cell1  | Cell2   |`;
    
    const html = markdownToTelegramHtml(markdown, { 
      tableMode: 'code' 
    });
    
    // Should contain code block markers
    expect(html).toContain('<pre><code>');
    expect(html).toContain('|');
  });

  it('should render tables with off mode (no table rendering)', () => {
    const markdown = `| Header1 | Header2 |
|--------|---------|
| Cell1  | Cell2   |`;
    
    // Should not throw, should render something
    expect(() => markdownToTelegramHtml(markdown, { 
      tableMode: 'off' 
    })).not.toThrow();
  });

  it('should handle complex tables with bullets mode', () => {
    const markdown = `| Feature | Status |
|---------|--------|
| Auth   | Done   |
| Proxy  | Done   |`;
    
    const html = markdownToTelegramHtml(markdown, { 
      tableMode: 'bullets' 
    });
    
    // In bullets mode, the first column becomes bold labels
    expect(html).toContain('<b>Auth</b>');
    expect(html).toContain('Status: Done');
  });

  it('should chunk tables correctly', () => {
    const markdown = `| Header |
|-------|
| Cell1| Cell2 |`;
    
    const chunks = markdownToTelegramChunks(markdown, 50, { 
      tableMode: 'code' 
    });
    
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('tableMode option', () => {
  it('should default to off when not specified', () => {
    const markdown = `| A | B |
|---|---|
| 1 | 2 |`;
    
    // When tableMode is not specified, it defaults to off
    expect(() => markdownToTelegramHtml(markdown)).not.toThrow();
  });

  it('should accept bullets mode', () => {
    const markdown = `| A | B |
|---|---|
| 1 | 2 |`;
    
    const html = markdownToTelegramHtml(markdown, { tableMode: 'bullets' });
    expect(html).toContain('•');
  });

  it('should accept code mode', () => {
    const markdown = `| A | B |
|---|---|
| 1 | 2 |`;
    
    const html = markdownToTelegramHtml(markdown, { tableMode: 'code' });
    expect(html).toContain('<pre><code>');
  });
});
