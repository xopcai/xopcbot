# Markdown to Telegram 转换实现

本文档描述了 xopcbot 如何将 Markdown 消息转换为 Telegram HTML 格式。

## 架构概述

基于 OpenClaw 的实现，采用 Markdown IR (Intermediate Representation) 方法：

```
Markdown → markdown-it → Tokens → IR → Telegram HTML
```

## 核心模块

### 1. Markdown IR (`src/markdown/`)

#### `ir.ts` - IR 解析器
- 使用 `markdown-it` 解析 Markdown
- 转换为结构化 IR: `{ text, styles, links }`
- 支持样式：bold, italic, strikethrough, code, code_block, spoiler, blockquote
- 支持表格：bullets 模式、code 模式
- 支持嵌套结构和链接

#### `render.ts` - 渲染引擎
- 通用渲染引擎 `renderMarkdownWithMarkers`
- 基于栈的标签嵌套处理 (LIFO)
- 支持自定义样式标记和链接构建

#### `chunk.ts` - 智能分块
- `chunkText()` - 基础长度分块
- `chunkMarkdownText()` - Markdown 感知分块（保护代码块）
- `chunkByParagraph()` - 段落优先分块
- `chunkByNewline()` - 换行分块

#### `fences.ts` - 代码块边界检测
- `parseFenceSpans()` - 检测 fenced code blocks
- `isSafeFenceBreak()` - 判断分割点是否在代码块内
- 支持 ``` 和 ~~~ 两种标记

### 2. Telegram 格式转换 (`src/channels/format.ts`)

#### 主要函数

```typescript
// 转换 Markdown 为 Telegram HTML
markdownToTelegramHtml(markdown, options)

// 分块转换（返回 HTML 和纯文本）
markdownToTelegramChunks(markdown, limit, options)

// 渲染为 Telegram HTML（支持 textMode 选项）
renderTelegramHtmlText(text, options)

// 格式化消息（包含文件引用保护）
formatTelegramMessage(markdown, options)
```

#### 文件引用保护

自动将文件扩展名（如 `.md`, `.go`, `.py`）包裹在 `<code>` 标签中，防止 Telegram 生成域名预览：

```typescript
// 输入
Check README.md for details

// 输出
Check <code>README.md</code> for details
```

支持的扩展名：md, go, py, pl, sh, am, at, be, cc

#### HTML 解析错误回退

当 HTML 解析失败时，自动降级为纯文本发送。

## 使用示例

### 基本转换

```typescript
import { markdownToTelegramHtml } from './markdown/telegram-format.js';

const html = markdownToTelegramHtml('**bold** and *italic*');
// 输出: '<b>bold</b> and <i>italic</i>'
```

### 分块发送

```typescript
import { markdownToTelegramChunks } from './markdown/telegram-format.js';

const chunks = markdownToTelegramChunks(longText, 4000);
for (const chunk of chunks) {
  await bot.api.sendMessage(chatId, chunk.html, { parse_mode: 'HTML' });
}
```

### 禁用文件引用保护

```typescript
import { formatTelegramMessage } from './markdown/telegram-format.js';

const result = formatTelegramMessage('Check main.py', { wrapFileRefs: false });
// 输出不会包含 <code>main.py</code>
```

## 与 OpenClaw 的差异

| 特性 | OpenClaw | xopcbot |
|------|----------|---------|
| Markdown 解析 | markdown-it | markdown-it (相同) |
| IR 结构 | `{ text, styles, links }` | 相同 |
| 代码块语言类名 | 不包含 | 不包含 (匹配 Telegram) |
| 表格处理 | bullets/code/off 模式 | 相同 |
| 文件引用保护 | 支持 | 支持 |
| HTML fallback | 支持 | 支持 |

## 测试

```bash
# 运行所有 markdown 相关测试
pnpm vitest run src/markdown/__tests__/ src/channels/__tests__/format.test.ts
```

## 参考

- OpenClaw 实现: https://github.com/mariozechner/openclaw/tree/main/src/telegram
- markdown-it: https://github.com/markdown-it/markdown-it
- Telegram Bot API: https://core.telegram.org/bots/api#html-style
