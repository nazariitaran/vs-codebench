# Unreleased

- Fixed "Save Unsaved File as Scratchpad" prompting to save the untitled editor by discarding its buffer before close and opening the new scratchpad automatically.
- Fixed a crash (`Cannot read properties of undefined (reading 'uri')`) when saving an untitled editor as a scratchpad if other tabs have no text URI.

---

# 1.3.0 - May 2026

- Added a scratchpad import workflow that can ingest a folder tree, preserve structure, skip binary files and symlinks, overwrite matching scratchpads in place, and generate an import summary scratchpad.
- Refactored scratchpads onto a dedicated `codebench-scratchpad` file system so logical names and folder paths stay stable even when backing files are renamed or migrated.
- Expanded scratchpad folder workflows with create-in-folder actions, recursive folder deletion with confirmation, and cleanup of backing files when folders are removed.
- Expanded GitHub Copilot scratchpad tools to 11 operations, including folder create/rename/move/delete, root moves, root-level and workspace-wide listing, and direct content reads/updates.
- Increased scratchpad capacity to 400 files and expanded scratchpad folder depth handling to 10 levels for imports and moves.

---

# 1.2.0 - May 2026

- Added hierarchical folder support for scratchpads (up to 5 levels deep).
- Added scratchpad folder commands: New Scratchpad Folder, Add Subfolder, Edit Folder, Delete Folder.
- Added drag-and-drop support for moving scratchpad files and folders between levels.
- Extended GitHub Copilot tools for scratchpads: UpdateScratchpadContent, CreateScratchpadFolder, MoveScratchpadToFolder, DeleteScratchpadFolder (9 tools total).

---

# 1.1.0 - February 2026

- Added GitHub Copilot tools for bookmarks and scratchpads.
- Added a command to save an untitled editor as a scratchpad.
- Increased max text length limits for todos, bookmarks, and bookmark folder names from 50 to 75 characters.

---

# 1.0.1 - September 2025

- Increased max allowed length for bookmark folder names from 20 to 50 characters.

---

# 1.0.0 - August 2025

Initial release! 🥳

- Comprehensive bookmark management with intuitive UI;
- Customizable bookmark colors;
- Integrated scratchpad for quick note-taking;
- TODO tracking with progress visualization;
- Seamless drag-and-drop functionality for organizing items.

---