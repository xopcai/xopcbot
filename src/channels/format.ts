/**
 * Telegram Message Formatting Utilities
 * 
 * Converts Markdown to Telegram HTML format with proper escaping
 * and file reference protection
 * 
 *
 */

// File extensions that share TLDs and commonly appear in code/documentation
const FILE_EXTENSIONS_WITH_TLD = new Set([
  'md', // Markdown (Moldova)
  'go', // Go language
  'py', // Python (Paraguay)
  'pl', // Perl (Poland)
  'sh', // Shell (Saint Helena)
  'am', // Automake files (Armenia)
  'at', // Assembly (Austria)
  'be', // Backend files (Belgium)
  'cc', // C++ source (Cocos Islands)
]);

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape HTML attribute values
 */
export function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

/**
 * Detect if a link is an auto-linked file reference
 */
function isAutoLinkedFileRef(href: string, label: string): boolean {
  const stripped = href.replace(/^https?:\/\//i, '');
  if (stripped !== label) {
    return false;
  }
  const dotIndex = label.lastIndexOf('.');
  if (dotIndex < 1) {
    return false;
  }
  const ext = label.slice(dotIndex + 1).toLowerCase();
  return FILE_EXTENSIONS_WITH_TLD.has(ext);
}

/**
 * Simple Markdown to HTML converter for Telegram
 */
export function markdownToTelegramHtml(markdown: string): string {
  let html = escapeHtml(markdown);

  // Code blocks (must be before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  html = html.replace(/_([^_]+)_/g, '<i>$1</i>');

  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, href) => {
    if (isAutoLinkedFileRef(href, text)) {
      return `<code>${escapeHtml(text)}</code>`;
    }
    const safeHref = escapeHtmlAttr(href);
    return `<a href="${safeHref}">${text}</a>`;
  });

  // Blockquotes
  html = html.replace(/^&gt; (.*$)/gm, '<blockquote>$1</blockquote>');

  // Spoilers (Telegram-specific)
  html = html.replace(/~~\|([^|]+)\|~~/g, '<tg-spoiler>$1</tg-spoiler>');

  return html;
}

/**
 * Convert Markdown to plain text (strip markdown syntax)
 * Used for fallback when HTML parsing fails
 */
export function markdownToPlainText(markdown: string): string {
  let text = markdown;

  // Code blocks - keep content, remove markers
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, '$2');

  // Inline code - keep content, remove backticks
  text = text.replace(/`([^`]+)`/g, '$1');

  // Bold - keep content, remove asterisks
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');

  // Italic - keep content, remove asterisks/underscores
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');

  // Strikethrough - keep content, remove tildes
  text = text.replace(/~~([^~]+)~~/g, '$1');

  // Links - convert to "text (url)" format
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Blockquotes - remove marker, keep content
  text = text.replace(/^&gt; (.*$)/gm, '$1');
  text = text.replace(/^> (.*$)/gm, '$1');

  // List markers - remove markers, keep content
  text = text.replace(/^\* (.*$)/gm, '$1');
  text = text.replace(/^- (.*$)/gm, '$1');
  text = text.replace(/^\d+\. (.*$)/gm, '$1');

  // Headers - remove markers, keep content
  text = text.replace(/^#{1,6} (.*$)/gm, '$1');

  return text.trim();
}

/**
 * Wrap standalone file references in &lt;code&gt; tags
 * Prevents Telegram from generating domain registrar previews
 */
export function wrapFileReferencesInHtml(html: string): string {
  // Track nesting depth for tags that should not be modified
  let codeDepth = 0;
  let preDepth = 0;
  let anchorDepth = 0;
  let result = '';
  let lastIndex = 0;

  const HTML_TAG_PATTERN = /(<\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?>/gi;
  let match: RegExpExecArray | null;

  while ((match = HTML_TAG_PATTERN.exec(html)) !== null) {
    const tagStart = match.index;
    const tagEnd = tagStart + match[0].length;
    const tagName = match[2].toLowerCase();
    const isClosing = match[1] === '</';

    // Process text before this tag
    if (tagStart > lastIndex) {
      const textSegment = html.slice(lastIndex, tagStart);
      result += wrapSegmentFileRefs(textSegment, codeDepth, preDepth, anchorDepth);
    }

    // Update nesting depth
    if (tagName === 'code') {
      codeDepth += isClosing ? -1 : 1;
    } else if (tagName === 'pre') {
      preDepth += isClosing ? -1 : 1;
    } else if (tagName === 'a') {
      anchorDepth += isClosing ? -1 : 1;
    }

    // Add the tag itself
    result += match[0];
    lastIndex = tagEnd;
  }

  // Process remaining text after last tag
  if (lastIndex < html.length) {
    const textSegment = html.slice(lastIndex);
    result += wrapSegmentFileRefs(textSegment, codeDepth, preDepth, anchorDepth);
  }

  return result;
}

/**
 * Wrap file references in a text segment (respecting nesting depth)
 */
function wrapSegmentFileRefs(
  text: string,
  codeDepth: number,
  preDepth: number,
  anchorDepth: number
): string {
  if (!text || codeDepth > 0 || preDepth > 0 || anchorDepth > 0) {
    return text;
  }

  const FILE_EXTENSIONS_PATTERN = Array.from(FILE_EXTENSIONS_WITH_TLD).join('|');
  const FILE_REFERENCE_PATTERN = new RegExp(
    `(^|[^a-zA-Z0-9_\\-/])([a-zA-Z0-9_.\\-./]+\\.(?:${FILE_EXTENSIONS_PATTERN}))(?=$|[^a-zA-Z0-9_\\-/])`,
    'gi'
  );

  return text.replace(FILE_REFERENCE_PATTERN, (match, prefix, filename) => {
    if (filename.startsWith('//')) {
      return match;
    }
    if (/https?:\/\/$/i.test(prefix)) {
      return match;
    }
    return `${prefix}<code>${escapeHtml(filename)}</code>`;
  });
}

/**
 * Fix malformed HTML tags by ensuring proper nesting
 * This handles cases where LLM generates invalid HTML like:
 * - <code>git<i>diff</code> (i tag not closed)
 * - <code>git</i>log</code> (i tag closed but not opened in context)
 */
function fixMalformedHtml(html: string): string {
  const result: string[] = [];
  const openTags: string[] = [];
  let i = 0;

  // Tags that are self-closing or should not be tracked
  const voidElements = new Set([
    'br', 'hr', 'img', 'input', 'link', 'meta', 'area', 'base', 'col', 'embed',
    'param', 'source', 'track', 'wbr'
  ]);

  // Tags that can be nested (inline elements)
  const inlineTags = new Set([
    'a', 'b', 'i', 'code', 's', 'strike', 'del', 'u', 'em', 'strong', 'span', 'tg-spoiler'
  ]);

  while (i < html.length) {
    // Check if we're at a tag
    if (html[i] === '<' && i + 1 < html.length && html[i + 1] !== '!') {
      // Find the end of the tag
      let tagEnd = html.indexOf('>', i);
      if (tagEnd === -1) {
        // No closing > found, treat as literal text
        result.push(html.slice(i));
        break;
      }

      const fullTag = html.slice(i, tagEnd + 1);

      // Skip HTML comments and DOCTYPE
      if (fullTag.startsWith('<!') || fullTag.startsWith('<!--')) {
        // Skip until end of comment
        const commentEnd = html.indexOf('-->', i);
        if (commentEnd !== -1) {
          i = commentEnd + 3;
        } else {
          result.push(html.slice(i));
          break;
        }
        continue;
      }

      // Check if it's a closing tag
      if (fullTag.startsWith('</')) {
        const tagName = fullTag.slice(2, -1).trim().toLowerCase().split(/\s/)[0];

        if (voidElements.has(tagName)) {
          // Invalid closing tag for void element, escape it
          result.push(escapeHtml(fullTag));
        } else {
          // Find and close the matching tag
          const lastIndex = openTags.lastIndexOf(tagName);
          if (lastIndex !== -1) {
            // Found matching tag, close all tags opened after it
            while (openTags.length > lastIndex + 1) {
              const tagToClose = openTags.pop()!;
              result.push(`</${tagToClose}>`);
            }
            // Close the matching tag
            openTags.pop();
            result.push(fullTag);
          } else {
            // No matching open tag, escape the closing tag
            result.push(escapeHtml(fullTag));
          }
        }
      } else if (fullTag.endsWith('/>') || voidElements.has(fullTag.slice(1, -1).trim().toLowerCase().split(/\s/)[0])) {
        // Self-closing tag or void element
        result.push(fullTag);
      } else {
        // Opening tag
        const tagName = fullTag.slice(1, -1).trim().toLowerCase().split(/\s/)[0];

        if (tagName && (inlineTags.has(tagName) || tagName === 'pre' || tagName === 'blockquote')) {
          // Track inline/nestableable tags
          openTags.push(tagName);
        }
        result.push(fullTag);
      }

      i = tagEnd + 1;
    } else {
      // Regular text
      result.push(html[i]);
      i++;
    }
  }

  // Close any remaining open tags
  while (openTags.length > 0) {
    result.push(`</${openTags.pop()}>`);
  }

  return result.join('');
}

/**
 * Validate HTML string for Telegram parse_mode
 * Returns true if the HTML appears to be valid
 */
export function isValidTelegramHtml(html: string): boolean {
  const voidElements = new Set([
    'br', 'hr', 'img', 'input', 'link', 'meta', 'area', 'base', 'col', 'embed',
    'param', 'source', 'track', 'wbr'
  ]);

  const openTags: string[] = [];
  let i = 0;

  while (i < html.length) {
    if (html[i] === '<' && i + 1 < html.length && html[i + 1] !== '!') {
      let tagEnd = html.indexOf('>', i);
      if (tagEnd === -1) return false;

      const fullTag = html.slice(i, tagEnd + 1);

      // Skip comments
      if (fullTag.startsWith('<!') || fullTag.startsWith('<!--')) {
        const commentEnd = html.indexOf('-->', i);
        if (commentEnd !== -1) {
          i = commentEnd + 3;
        } else {
          return false;
        }
        continue;
      }

      const isClosing = fullTag.startsWith('</');
      const tagName = fullTag.slice(isClosing ? 2 : 1, -1).trim().toLowerCase().split(/\s/)[0];

      if (!tagName) {
        i = tagEnd + 1;
        continue;
      }

      if (voidElements.has(tagName)) {
        // Void elements are self-closing, no need to track
      } else if (isClosing) {
        const lastIndex = openTags.lastIndexOf(tagName);
        if (lastIndex === -1) {
          // Closing tag without matching opening
          return false;
        }
        // Close all tags between lastIndex and end
        openTags.splice(lastIndex + 1);
        openTags.pop();
      } else {
        openTags.push(tagName);
      }

      i = tagEnd + 1;
    } else {
      i++;
    }
  }

  return openTags.length === 0;
}

/**
 * Format message for Telegram with proper HTML and file reference protection
 */
export function formatTelegramMessage(
  markdown: string,
  options: { wrapFileRefs?: boolean } = {}
): { html: string; text: string } {
  let html = markdownToTelegramHtml(markdown);
  html = options.wrapFileRefs !== false
    ? wrapFileReferencesInHtml(html)
    : html;

  // Fix any malformed HTML tags
  html = fixMalformedHtml(html);

  return {
    html,
    text: markdown,
  };
}

/**
 * Split long message into chunks respecting code blocks and paragraphs
 */
export function splitTelegramMessage(
  text: string,
  maxChars: number = 4000
): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    // Try to split at paragraph boundary
    let splitIndex = remaining.lastIndexOf('\n\n', maxChars);

    // If no paragraph boundary, try newline
    if (splitIndex === -1 || splitIndex < maxChars * 0.5) {
      splitIndex = remaining.lastIndexOf('\n', maxChars);
    }

    // If still no good split point, hard split
    if (splitIndex === -1 || splitIndex < maxChars * 0.5) {
      splitIndex = maxChars;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}
