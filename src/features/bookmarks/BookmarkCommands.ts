import * as vscode from 'vscode';
import { BookmarksProvider } from './BookmarksProvider';
import BookmarkValidator from './BookmarkValidator';
import { BOOKMARK_COLORS } from './Models';

export function registerBookmarkCommands(
  context: vscode.ExtensionContext,
  bookmarksProvider: BookmarksProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('codebench.jumpToBookmark', async (bookmark: any) => {
      if (bookmark) {
        await bookmarksProvider.jumpToBookmark(bookmark);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.toggleBookmark', async (args?: any) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const scheme = editor.document.uri.scheme;
      if (scheme !== 'file') {
        vscode.window.showWarningMessage('Bookmarks are only supported for files saved on disk.');
        return;
      }

      // Determine target uri and line, preferring context args from the menu invocation
      let uri: vscode.Uri | undefined = undefined;
      let line: number | undefined = undefined;

      if (args) {
        if (args.uri) {
          uri = args.uri as vscode.Uri;
        }
        if (typeof args === 'number') {
          // Glyph margin often passes 1-based line numbers
          line = Math.max(0, (args as number) - 1);
        } else if (typeof (args as any)?.lineNumber === 'number') {
          // VS Code often passes 1-based lineNumber in menus
          const ln = (args as any).lineNumber as number;
          line = Math.max(0, ln - 1);
        } else if (typeof (args as any)?.line === 'number') {
          // Fallback if some contexts pass 'line'
          const ln = (args as any).line as number;
          line = Math.max(0, ln - 1);
        } else if ((args as any).range && typeof (args as any).range.start?.line === 'number') {
          line = (args as any).range.start.line; // zero-based
        }
      }

      if (!uri) {
        uri = editor.document.uri;
      }
      if (line === undefined) {
        line = editor.selection.active.line;
      }

      const fileUri = uri.toString();

      // Check if bookmark exists at this line; if not, try 1-based/adjacent fallback
      let existingBookmark = bookmarksProvider.getBookmarkForLine(fileUri, line);
      if (!existingBookmark && line > 0) {
        existingBookmark = bookmarksProvider.getBookmarkForLine(fileUri, line - 1);
      }

      if (existingBookmark) {
        // Remove bookmark
        await bookmarksProvider.deleteBookmark(existingBookmark.id);
      } else {
        // Add bookmark at the originally computed line
        const lineText = editor.document.lineAt(line).text.trim();
        await bookmarksProvider.addBookmark(fileUri, line, lineText);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.addBookmark', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }
      const scheme = editor.document.uri.scheme;
      if (scheme !== 'file' && scheme !== 'untitled') {
        vscode.window.showWarningMessage('Bookmarks are only supported for file or untitled text editors.');
        return;
      }

      // Check total count first
      const allBookmarks = bookmarksProvider.getAllBookmarks();
      const countError = BookmarkValidator.validateTotalCount(allBookmarks);
      if (countError) {
        vscode.window.showErrorMessage(countError);
        return;
      }

      const fileUri = editor.document.uri.toString();
      const line = editor.selection.active.line;
      const lineText = editor.document.lineAt(line).text.trim();

      // Check if bookmark already exists at this line
      const existingBookmark = bookmarksProvider.getBookmarkForLine(fileUri, line);
      if (existingBookmark) {
        vscode.window.showWarningMessage('Bookmark already exists at this line');
        return;
      }

      // Ask for optional text with validation
      const input = await vscode.window.showInputBox({
        prompt: 'Enter bookmark text (optional)',
        placeHolder: lineText || 'Bookmark description',
        value: lineText,
        validateInput: (value) => {
          if (value.trim()) {
            return BookmarkValidator.validateText(value);
          }
          return null; // Allow empty text
        }
      });

      if (input !== undefined) {
        // User didn't cancel
        await bookmarksProvider.addBookmark(fileUri, line, input || lineText);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.editBookmark', async (item: any) => {
      if (item && item.id) {
        const bookmark = bookmarksProvider.getBookmarkById(item.id);
        if (!bookmark) {
          return;
        }

        const input = await vscode.window.showInputBox({
          prompt: 'Edit bookmark text',
          value: bookmark.text,
          validateInput: (value) => {
            return BookmarkValidator.validateText(value);
          }
        });

        if (input !== undefined && input !== bookmark.text) {
          await bookmarksProvider.editBookmark(item.id, input);
        }
      }
    }),

    vscode.commands.registerCommand('vs-codebench.deleteBookmark', async (item: any) => {
      if (item && item.id) {
        // Delete without confirmation as requested
        await bookmarksProvider.deleteBookmark(item.id);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.changeBookmarkColor', async (itemOrArgs: any) => {
      // Helper to open picker and apply color by bookmark id
      const pickAndApply = async (bookmarkId: string) => {
        const colors = Object.values(BOOKMARK_COLORS).map(color => ({
          label: color.label,
          description: color.name === 'default' ? 'Default' : undefined,
          value: color.name === 'default' ? undefined : color.name
        }));
        const selected = await vscode.window.showQuickPick(colors, {
          placeHolder: 'Select bookmark color',
          title: 'Bookmark Color'
        });
        if (selected !== undefined) {
          await bookmarksProvider.changeBookmarkColor(bookmarkId, selected.value);
        }
      };

      // Case 1: invoked from tree item (has id)
      if (itemOrArgs && itemOrArgs.id) {
        const bookmark = bookmarksProvider.getBookmarkById(itemOrArgs.id);
        if (!bookmark) {
          return;
        }
        await pickAndApply(itemOrArgs.id);
        return;
      }

      // Case 2: invoked from editor context (glyph margin / line number)
      // Try to resolve file URI and line number from args or editor state
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      // Derive line number from possible argument shapes
      let line: number | undefined = undefined;
      let uri: vscode.Uri | undefined = undefined;

      // Some menus pass args as a number, or as an object with lineNumber, or a range
      if (typeof itemOrArgs === 'number') {
        // Glyph margin often passes 1-based line numbers
        line = Math.max(0, (itemOrArgs as number) - 1);
      } else if (itemOrArgs && typeof itemOrArgs.lineNumber === 'number') {
        const ln = itemOrArgs.lineNumber as number; // likely 1-based
        line = Math.max(0, ln - 1);
      } else if (itemOrArgs && typeof (itemOrArgs as any).line === 'number') {
        const ln = (itemOrArgs as any).line as number;
        line = Math.max(0, ln - 1);
      } else if (itemOrArgs && itemOrArgs.range && typeof itemOrArgs.range.start?.line === 'number') {
        line = itemOrArgs.range.start.line; // zero-based
      } else if (Array.isArray(itemOrArgs) && itemOrArgs.length > 0) {
        // In some cases VS Code passes [uri, range] or [uri]
        const maybeUri = itemOrArgs.find((v: any) => v && typeof v.path === 'string' && v.scheme);
        const maybeRange = itemOrArgs.find((v: any) => v && v.start && typeof v.start.line === 'number');
        if (maybeUri) {
          uri = maybeUri as vscode.Uri;
        }
        if (maybeRange) {
          line = maybeRange.start.line as number;
        }
      }

      if (itemOrArgs && itemOrArgs.uri) {
        uri = itemOrArgs.uri as vscode.Uri;
      }

      // Fallbacks
      if (line === undefined) {
        line = editor.selection.active.line;
      }
      if (!uri) {
        uri = editor.document.uri;
      }

      const fileUri = uri.toString();
      let bookmark = bookmarksProvider.getBookmarkForLine(fileUri, line);
      if (!bookmark && line > 0) {
        // Fallback to 1-based mismatch scenario
        bookmark = bookmarksProvider.getBookmarkForLine(fileUri, line - 1);
      }
      if (!bookmark) {
        vscode.window.showWarningMessage('No bookmark at this line to change color.');
        return;
      }

      await pickAndApply(bookmark.id);
    }),

    // Register folder commands
    // This command is for context menu - uses the clicked folder as parent
    vscode.commands.registerCommand('vs-codebench.addFolder', async (item?: any) => {
      const folderName = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'Folder name',
        validateInput: BookmarkValidator.validateFolderName
      });

      if (folderName) {
        // When called from context menu, use the clicked folder as parent
        const parentId = item?.id;
        await bookmarksProvider.addFolder(folderName, parentId);
      }
    }),

    // This command is for toolbar - always creates folders at root
    vscode.commands.registerCommand('vs-codebench.addRootFolder', async () => {
      const folderName = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'Folder name',
        validateInput: BookmarkValidator.validateFolderName
      });

      if (folderName) {
        // Always create at root (parentId = undefined)
        await bookmarksProvider.addFolder(folderName, undefined);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.editFolder', async (item: any) => {
      if (item && item.id) {
        const folderName = await vscode.window.showInputBox({
          prompt: 'Edit folder name',
          value: item.label,
          validateInput: BookmarkValidator.validateFolderName
        });

        if (folderName && folderName !== item.label) {
          await bookmarksProvider.editFolder(item.id, folderName);
        }
      }
    }),

    vscode.commands.registerCommand('vs-codebench.deleteFolder', async (item: any) => {
      if (item && item.id) {
        await bookmarksProvider.deleteFolder(item.id);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.clearAllBookmarks', async () => {
      const all = bookmarksProvider.getAllBookmarks();
      const folders = bookmarksProvider.getFolders();
      if (all.length === 0 && folders.length === 0) {
        vscode.window.showInformationMessage('There are no bookmarks to clear.');
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Clear all bookmarks${folders.length ? ' and folders' : ''}? This cannot be undone.`,
        { modal: true },
        'Clear All'
      );
      if (confirm === 'Clear All') {
        await bookmarksProvider.clearAll();
      }
    })
  );
}
