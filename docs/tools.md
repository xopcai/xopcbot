# Built-in Tools Reference

xopcbot has a set of built-in tools for the Agent to call.

## Tools List

| Tool | Name | Description |
|------|------|-------------|
| 📄 Read | `read_file` | Read file content (truncated to 50KB/500 lines) |
| ✍️ Write | `write_file` | Create or overwrite file |
| ✏️ Edit | `edit_file` | Replace text in file |
| 📂 List | `list_dir` | List directory contents |
| 💻 Shell | `shell` | Execute Shell command (truncated to 50KB) |
| 🔍 Search | `grep` | Search text in files |
| 📄 Find | `find` | Find files by conditions |
| 🔍 Web Search | `web_search` | Search the web using Brave Search |
| 📄 Web Fetch | `web_fetch` | Fetch web page content |
| 📤 Message | `send_message` | Send message to channel |
| 🔍 Memory Search | `memory_search` | Search memory (semantic with LanceDB) |
| 📄 Memory Get | `memory_get` | Read memory snippets |
| 💾 Memory Store | `memory_store` | Store memory (LanceDB only) |
| 🗑️ Memory Forget | `memory_forget` | Delete memory (LanceDB only) |

---

## 📄 read_file

Read file content. Output automatically truncated to first 500 lines or 50KB.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | ✅ | File path |
| `limit` | number | ❌ | Maximum lines (default 500) |

---

## ✍️ write_file

Create or overwrite a file.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | ✅ | File path |
| `content` | string | ✅ | File content |

---

## ✏️ edit_file

Replace specified text in a file.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | ✅ | File path |
| `oldText` | string | ✅ | Text to replace |
| `newText` | string | ✅ | Replacement text |

---

## 📂 list_dir

List directory contents.

---

## 💻 shell

Execute Shell command. Output automatically truncated to last 50KB.

### Limits

- Timeout: 5 minutes
- Output truncation: 50KB

---

## 🔍 grep

Search text in files.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | ✅ | Search pattern (supports regex) |
| `glob` | string | ❌ | File matching pattern |
| `path` | string | ❌ | Search directory |
| `ignoreCase` | boolean | ❌ | Ignore case |
| `literal` | boolean | ❌ | Plain text matching |
| `context` | number | ❌ | Number of context lines |
| `limit` | number | ❌ | Maximum results (default 100) |

---

## 📄 find

Find files by conditions.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | ✅ | Filename matching pattern |
| `path` | string | ❌ | Search directory |
| `limit` | number | ❌ | Maximum results |

---

## 🔍 web_search

Search the web using Brave Search API.

### Configuration

```bash
export BRAVE_SEARCH_API_KEY="your-api-key"
```

---

## 📄 web_fetch

Fetch web page content.

---

## 📤 send_message

Send message to configured channel.

---

## 🔍 memory_search

Search memory files. Must be called before answering questions about previous work, decisions, etc.

**Backend**: Works with both `builtin` (fuzzy search) and `lancedb` (semantic vector search) backends.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Search query |
| `maxResults` | number | ❌ | Maximum results (default 5) |
| `minScore` | number | ❌ | Minimum similarity score (default 0.3) |

---

## 📄 memory_get

Read snippets from memory files.

**Backend**: For builtin, reads from MEMORY.md files. For LanceDB, reads by memory ID.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | ✅ | File path or memory ID |
| `from` | number | ❌ | Start line number |
| `lines` | number | ❌ | Number of lines |

---

## 💾 memory_store

Store a new memory. **LanceDB backend only.**

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | ✅ | Content to remember |
| `importance` | number | ❌ | Importance 0-1 (default 0.7) |
| `category` | string | ❌ | Category: preference, fact, decision, entity, other |

---

## 🗑️ memory_forget

Delete a memory by ID. **LanceDB backend only.**

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memoryId` | string | ✅ | Memory ID to delete |

---

## Security Limits

| Operation | Limit |
|-----------|-------|
| File path | Restricted to workspace directory |
| Shell command | 5 minute timeout |
| File size | Maximum 10MB |
