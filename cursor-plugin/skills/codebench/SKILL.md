---
name: codebench
description: Use VS CodeBench todos, bookmarks, and scratchpads via MCP tools. Apply when the user wants persistent editor-local tasks, line bookmarks, or notes that should not be committed to the git repo.
---

# VS CodeBench

VS CodeBench stores todos, bookmarks, and scratchpads in extension storage for the current workspace. Scratchpad bodies are not workspace files. Do not create repo files such as `TODO.md` or `notes.md` when the user wants CodeBench data.

## When to use it

- Capture a task the user wants to track in the CodeBench Todos view.
- Bookmark a file line instead of leaving a comment.
- Save a snippet, prompt, or scratch note that should stay out of git.

## How to call tools

Tools are exposed to Cursor Agent as MCP tools named `codebench_*`.

1. Read first. Call `codebench_get_todos`, `codebench_get_bookmarks`, or `codebench_get_scratchpads` to resolve IDs.
2. Mutate with the matching `codebench_*` tool. Do not guess IDs.
3. For scratchpad bodies, use `codebench_get_scratchpad_content` / `codebench_update_scratchpad_content`. Do not try to `read_file` a `codebench-scratchpad:` URI.

## Limits

- Todos: max 100 items, max 2 nesting levels below a root todo, text 1-75 characters.
- Bookmarks: max 200 items, folder depth 3, text 1-75 characters. Colors: `default`, `red`, `green`, `yellow`, `purple`. Bookmark lines are zero-based.
- Scratchpads: max 400 files, folder depth 5, names 1-75 characters. `codebench_get_scratchpads` defaults to root-level files; pass `includeAll: true` for a workspace-wide list.

## After changes

The CodeBench sidebar updates from the same in-memory services as these tools. Tell the user the change is in Todos, Bookmarks, or Scratchpads, not in the git working tree.
