# AGENTS.md — VS CodeBench

## Project Overview
VS CodeBench is a VS Code extension (TypeScript) that provides three productivity features in a single sidebar panel: hierarchical **Todos**, line-level **Bookmarks** (with color & folders), and persistent **Scratchpads**. It also exposes GitHub Copilot language model tools for bookmark and scratchpad operations. All data is scoped to the active workspace via VS Code's `Memento` storage API.

- **Publisher:** `nazariitaran`
- **Extension ID:** `nazariitaran.vs-codebench`
- **License:** MIT
- **VS Code engine:** `^1.101.0`
- **Entry point:** `src/extension.ts` → bundled to `out/extension.js`

## Tech Stack
- **Language:** TypeScript (strict mode), targeting ES2022
- **Bundler:** esbuild (see `esbuild.js`) — bundles to a single CJS file
- **Linter:** ESLint (flat config `eslint.config.mjs`) — 2-space indent, no tabs, semi required
- **Test framework:** Mocha (via `@vscode/test-cli` + `@vscode/test-electron`)
- **Package manager:** npm (lockfile: `package-lock.json`)
- **Node version:** 22.x (CI)
- **Runtime dependency:** `uuid` (v4 for generating IDs)

## Repository Structure
```
src/
├── extension.ts                  # activate/deactivate — wires providers, tree views, commands
├── common/
│   ├── storage/
│   │   ├── StorageService.ts     # Generic + namespaced storage over VS Code Memento API
│   │   └── index.ts
│   └── utils/
│       └── themeUtils.ts         # Dark/light theme detection helper
├── features/
│   ├── todos/
│   │   ├── Models.ts             # Todo, TodoData, TodoStats interfaces
│   │   ├── TodoService.ts        # CRUD, reorder, persistence logic
│   │   ├── TodoValidator.ts      # Input validation (text length, nesting depth, count limits)
│   │   ├── TodoCommands.ts       # VS Code command registrations
│   │   ├── TodosProvider.ts      # TreeDataProvider implementation
│   │   ├── index.ts              # Public barrel exports
│   │   └── views/
│   │       ├── TodoTreeItem.ts
│   │       ├── TodoDragAndDropController.ts
│   │       └── TodoProgressPanel.ts   # Webview stats panel
│   ├── bookmarks/
│   │   ├── Models.ts             # Bookmark, BookmarkFolder, color types/constants
│   │   ├── BookmarkAiTools.ts    # GitHub Copilot language model tools (bookmark CRUD/folders/colors)
│   │   ├── BookmarkService.ts    # CRUD, folder management, persistence
│   │   ├── BookmarkValidator.ts  # Validation (text, folder name, count limits)
│   │   ├── BookmarkCommands.ts
│   │   ├── BookmarksProvider.ts  # TreeDataProvider + decoration management
│   │   ├── BookmarkDecorationService.ts  # Gutter/line decorations
│   │   ├── index.ts
│   │   └── views/
│   │       ├── BookmarkTreeItem.ts
│   │       ├── BookmarkFolderTreeItem.ts
│   │       └── BookmarkDragAndDropController.ts
│   └── scratchpads/
│       ├── Models.ts             # ScratchFile, ScratchpadFolder, ScratchpadData interfaces
│       ├── ScratchpadAiTools.ts  # GitHub Copilot language model tools (9 tools)
│       ├── ScratchpadService.ts
│       ├── ScratchpadValidator.ts # Input validation (file/folder name, count limits)
│       ├── ScratchpadCommands.ts
│       ├── ScratchpadsProvider.ts
│       ├── ScratchpadFolderTreeItem.ts  # Tree item for folder nodes
│       ├── index.ts
│       └── views/
│           ├── ScratchpadItem.ts
│           └── ScratchpadDragAndDropController.ts
└── test/
    ├── testUtils.ts              # Mock context factory, helpers
    ├── common/storage/           # Unit tests for StorageService
    ├── features/                 # Unit tests for feature-specific logic
    └── integration/              # Integration tests (command execution, DnD, persistence)
```

## Architecture Patterns

### Feature Module Pattern
Each feature (`todos`, `bookmarks`, `scratchpads`) follows the same layered structure:
1. **Models.ts** — interfaces, types, version constants (e.g. `CURRENT_TODO_VERSION`)
2. **{Feature}Service.ts** — business logic, CRUD, persistence via `NamespacedStorageService`
3. **{Feature}Validator.ts** — static validation methods returning `string | null` (error message or null)
4. **{Feature}Commands.ts** — `register{Feature}Commands()` function binding VS Code commands
5. **{Feature}Provider.ts** — `TreeDataProvider` implementation, owns a Service instance, fires tree refresh events
6. **views/** — `TreeItem` subclasses, `DragAndDropController` implementations
7. **index.ts** — barrel file re-exporting public API

### Storage
- `StorageService` wraps VS Code's `Memento` API with scope detection (`workspace` / `global` / `auto`)
- `NamespacedStorageService` extends it with deterministic key generation: `{feature}::{workspaceUri}::{subKey}`
- Each service creates its own namespaced storage: `createNamespacedStorage(context, 'todos')`

### Extension Lifecycle
- `activate()` creates three Providers, three TreeViews with DnD controllers, registers all feature commands, and registers GitHub Copilot tools for bookmarks/scratchpads
- `activate()` returns `{ todosProvider, bookmarksProvider, scratchpadsProvider }` for test access
- All disposables go into `context.subscriptions`

### GitHub Copilot Tools
- Tools are contributed via `package.json` → `contributes.languageModelTools` and registered with `vscode.lm.registerTool(...)`.
- Bookmark tools (8): `codebench_get_bookmarks`, `codebench_add_bookmark`, `codebench_move_bookmark_to_folder`, `codebench_rename_bookmark`, `codebench_set_bookmark_color`, `codebench_remove_bookmark`, `codebench_create_bookmark_folder`, `codebench_remove_bookmark_folder`.
- Scratchpad tools (9): `codebench_get_scratchpads`, `codebench_get_scratchpad_content`, `codebench_create_scratchpad`, `codebench_update_scratchpad_content`, `codebench_rename_scratchpad`, `codebench_delete_scratchpad`, `codebench_create_scratchpad_folder`, `codebench_move_scratchpad_to_folder`, `codebench_delete_scratchpad_folder`.
- Tool outputs are JSON text payloads wrapped in `LanguageModelToolResult`.

## Build & Development Commands
```sh
npm run compile          # Type-check + lint + esbuild bundle
npm run check-types      # TypeScript type checking (tsc --noEmit)
npm run lint             # ESLint on src/
npm run watch            # Concurrent esbuild watch + tsc watch
npm run compile-tests    # Compile tests to out/ (needed before running tests)
npm run pretest          # compile-tests + compile + lint
npm run test             # Run tests via @vscode/test-cli (requires VS Code / xvfb)
npm run package          # Production build (minified, no sourcemaps)
```

## Testing

### Test structure
- **Unit tests:** `src/test/common/` and `src/test/features/` — test services and validators in isolation using mock contexts from `testUtils.ts`
- **Integration tests:** `src/test/integration/` — test full command flows within a real VS Code Extension Host

### Running tests
```sh
npm run pretest && npm test
```
Tests require a VS Code instance (Extension Host). On headless CI, `xvfb-run` is used.

### Test conventions
- Use `suite()` / `test()` (Mocha style), not `describe` / `it`
- Use `assert` from Node.js (not chai/expect)
- Set generous timeouts for `setup` (30s) and integration tests (20s): `this.timeout(N)`
- Stub VS Code APIs (e.g. `showInputBox`) by overriding and restoring in `teardown`
- Access providers via `extension.exports` in integration tests
- Clean state at the start of each test to avoid cross-test interference
- Test file naming: `*.test.ts`, compiled output goes to `out/test/`

## Code Style & Conventions
- **Indentation:** 2 spaces, no tabs (enforced by ESLint)
- **Semicolons:** required
- **Naming:** `camelCase` for imports, `PascalCase` for classes/types/interfaces
- **Curly braces:** always (ESLint `curly: warn`)
- **Equality:** strict (`===`) only (ESLint `eqeqeq: warn`)
- **Path aliases:** `@/*` → `src/*`, `@common/*` → `src/common/*`, `@features/*` → `src/features/*` (configured in both `tsconfig.json` and `esbuild.js`)
- **Validators** are classes with static methods returning `string | null`
- **Default exports** are used only for Validators; everything else uses named exports via barrel files
- **IDs** are generated with `uuid` v4

## Business Rules & Limits
- Todos: max 100 total items, max 2 levels of nesting (parent → child → grandchild), text 1–75 chars
- Bookmarks: max 200 items, folder depth up to 3 levels, bookmark text 1–75 chars, folder name 1–75 chars
- Scratchpads: max 200 files, folder depth up to 5 levels, file text 1–75 chars, folder name 1–75 chars
- Bookmark colors: `default` (blue), `red`, `green`, `yellow`, `purple`
- All commands are prefixed with `vs-codebench.`

## CI/CD
- **CI** (`.github/workflows/ci.yml`): runs on push to `main`/`develop` and PRs to `main`
  - Steps: `npm ci` → lint → type-check → compile → test (xvfb headless)
  - Also packages the .vsix as an artifact
- **Release** (`.github/workflows/release.yml`): triggered by `v*` tags
  - Packages and publishes to VS Code Marketplace via `vsce publish`
  - Creates a GitHub Release with the .vsix attached

## Important Notes for Agents
- Do NOT run `npm run dev` or `npm run watch` — these are long-running processes that block execution.
- Always run `npm run compile` after making changes to verify correctness.
- The `out/` directory is gitignored build output — never edit files there.
- When adding a new feature, follow the existing module pattern: Models → Service → Validator → Commands → Provider → views/ → index.ts barrel.
- Storage keys are workspace-scoped by default — be careful with `'auto'` scope behavior.
- The extension activates on `onStartupFinished` — it is always active once VS Code loads.
- All command IDs are defined in `package.json` under `contributes.commands` — keep them in sync with `{Feature}Commands.ts`.
- When adding new commands, also update `contributes.menus` in `package.json` for proper visibility in tree views and context menus.
- `vs-codebench.saveUnsavedAsScratchpad` is available only for `resourceScheme == 'untitled'` in the editor context menu.
- When adding/changing Copilot tools, keep `contributes.languageModelTools` in sync with `BookmarkAiTools.ts` and `ScratchpadAiTools.ts`.
