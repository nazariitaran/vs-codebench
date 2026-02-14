import * as vscode from 'vscode';
import { BOOKMARK_COLORS, BookmarkColorName } from './Models';
import BookmarkValidator from './BookmarkValidator';
import { BookmarksProvider } from './BookmarksProvider';

interface GetBookmarksInput {
  fileUri?: string;
  folderId?: string;
  includeFolders?: boolean;
}

interface AddBookmarkInput {
  fileUri: string;
  line: number;
  text?: string;
}

interface AddBookmarkToFolderInput {
  bookmarkId: string;
  folderId: string;
}

interface RenameBookmarkInput {
  bookmarkId: string;
  text: string;
}

interface SetBookmarkColorInput {
  bookmarkId: string;
  color: BookmarkColorName;
}

interface RemoveBookmarkInput {
  bookmarkId: string;
}

interface CreateBookmarkFolderInput {
  name: string;
  parentFolderId?: string;
}

interface RemoveBookmarkFolderInput {
  folderId: string;
  force?: boolean;
}

function resultFromObject(payload: unknown): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))
  ]);
}

function normalizeFileUri(fileUriOrPath: string): string {
  if (!fileUriOrPath || fileUriOrPath.trim().length === 0) {
    throw new Error('fileUri must be provided. Use an absolute path or file:// URI.');
  }

  if (fileUriOrPath.startsWith('file://')) {
    return vscode.Uri.parse(fileUriOrPath).toString();
  }

  return vscode.Uri.file(fileUriOrPath).toString();
}

class GetBookmarksTool implements vscode.LanguageModelTool<GetBookmarksInput> {
  constructor(private bookmarksProvider: BookmarksProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetBookmarksInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input ?? {};
    const fileUri = input.fileUri ? normalizeFileUri(input.fileUri) : undefined;
    const includeFolders = input.includeFolders ?? true;

    let bookmarks = this.bookmarksProvider.getAllBookmarks();
    if (fileUri) {
      bookmarks = bookmarks.filter(bookmark => bookmark.fileUri === fileUri);
    }
    if (input.folderId) {
      bookmarks = bookmarks.filter(bookmark => bookmark.parentId === input.folderId);
    }

    const folders = includeFolders
      ? this.bookmarksProvider.getFolders().filter(folder => {
        if (input.folderId) {
          return folder.id === input.folderId || folder.parentId === input.folderId;
        }
        return true;
      })
      : [];

    return resultFromObject({
      count: bookmarks.length,
      bookmarks,
      folders
    });
  }
}

class AddBookmarkTool implements vscode.LanguageModelTool<AddBookmarkInput> {
  constructor(private bookmarksProvider: BookmarksProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AddBookmarkInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    if (!Number.isInteger(input.line) || input.line < 0) {
      throw new Error('line must be a non-negative integer and is zero-based.');
    }

    const allBookmarks = this.bookmarksProvider.getAllBookmarks();
    const countError = BookmarkValidator.validateTotalCount(allBookmarks);
    if (countError) {
      throw new Error(countError);
    }

    const fileUri = normalizeFileUri(input.fileUri);
    const existingBookmark = this.bookmarksProvider.getBookmarkForLine(fileUri, input.line);
    if (existingBookmark) {
      throw new Error('Bookmark already exists at this line.');
    }

    const text = (input.text ?? `Line ${input.line + 1}`).trim();
    const textError = BookmarkValidator.validateText(text);
    if (textError) {
      throw new Error(textError);
    }

    await this.bookmarksProvider.addBookmark(fileUri, input.line, text);
    const created = this.bookmarksProvider.getBookmarkForLine(fileUri, input.line);

    return resultFromObject({
      success: true,
      bookmark: created
    });
  }
}

class MoveBookmarkToFolderTool implements vscode.LanguageModelTool<AddBookmarkToFolderInput> {
  constructor(private bookmarksProvider: BookmarksProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AddBookmarkToFolderInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const bookmark = this.bookmarksProvider.getBookmarkById(input.bookmarkId);
    if (!bookmark) {
      throw new Error('Bookmark not found. Provide a valid bookmarkId from get_bookmarks results.');
    }

    const folder = this.bookmarksProvider.getFolders().find(f => f.id === input.folderId);
    if (!folder) {
      throw new Error('Folder not found. Provide a valid folderId from get_bookmarks results.');
    }

    await this.bookmarksProvider.moveToFolder(input.bookmarkId, folder.id);
    const updated = this.bookmarksProvider.getBookmarkById(input.bookmarkId);

    return resultFromObject({
      success: true,
      bookmark: updated
    });
  }
}

class RenameBookmarkTool implements vscode.LanguageModelTool<RenameBookmarkInput> {
  constructor(private bookmarksProvider: BookmarksProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RenameBookmarkInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const bookmark = this.bookmarksProvider.getBookmarkById(input.bookmarkId);
    if (!bookmark) {
      throw new Error('Bookmark not found.');
    }

    const textError = BookmarkValidator.validateText(input.text ?? '');
    if (textError) {
      throw new Error(textError);
    }

    await this.bookmarksProvider.editBookmark(input.bookmarkId, input.text);
    const updated = this.bookmarksProvider.getBookmarkById(input.bookmarkId);

    return resultFromObject({
      success: true,
      bookmark: updated
    });
  }
}

class SetBookmarkColorTool implements vscode.LanguageModelTool<SetBookmarkColorInput> {
  constructor(private bookmarksProvider: BookmarksProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SetBookmarkColorInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const bookmark = this.bookmarksProvider.getBookmarkById(input.bookmarkId);
    if (!bookmark) {
      throw new Error('Bookmark not found.');
    }

    const isValidColor = Object.keys(BOOKMARK_COLORS).includes(input.color);
    if (!isValidColor) {
      throw new Error('Invalid bookmark color. Allowed values: default, red, green, yellow, purple.');
    }

    const color = input.color === 'default' ? undefined : input.color;
    await this.bookmarksProvider.changeBookmarkColor(input.bookmarkId, color);
    const updated = this.bookmarksProvider.getBookmarkById(input.bookmarkId);

    return resultFromObject({
      success: true,
      bookmark: updated
    });
  }
}

class RemoveBookmarkTool implements vscode.LanguageModelTool<RemoveBookmarkInput> {
  constructor(private bookmarksProvider: BookmarksProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RemoveBookmarkInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const bookmark = this.bookmarksProvider.getBookmarkById(input.bookmarkId);
    if (!bookmark) {
      throw new Error('Bookmark not found.');
    }

    await this.bookmarksProvider.deleteBookmark(input.bookmarkId);

    return resultFromObject({
      success: true,
      deletedBookmarkId: input.bookmarkId
    });
  }
}

class CreateBookmarkFolderTool implements vscode.LanguageModelTool<CreateBookmarkFolderInput> {
  constructor(private bookmarksProvider: BookmarksProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CreateBookmarkFolderInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const nameError = BookmarkValidator.validateFolderName(input.name ?? '');
    if (nameError) {
      throw new Error(nameError);
    }

    if (input.parentFolderId) {
      const parent = this.bookmarksProvider.getFolders().find(f => f.id === input.parentFolderId);
      if (!parent) {
        throw new Error('Parent folder not found.');
      }
      const depth = this.bookmarksProvider.getFolderDepth(input.parentFolderId);
      if (depth >= 3) {
        throw new Error('Maximum folder depth (3 levels) reached.');
      }
    }

    await this.bookmarksProvider.addFolder(input.name, input.parentFolderId);
    const createdFolder = this.bookmarksProvider.getFolders()
      .find(folder => folder.name === input.name.trim() && folder.parentId === input.parentFolderId);

    return resultFromObject({
      success: true,
      folder: createdFolder
    });
  }
}

class RemoveBookmarkFolderTool implements vscode.LanguageModelTool<RemoveBookmarkFolderInput> {
  constructor(private bookmarksProvider: BookmarksProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RemoveBookmarkFolderInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const folder = this.bookmarksProvider.getFolders().find(f => f.id === input.folderId);
    if (!folder) {
      throw new Error('Folder not found.');
    }

    const force = input.force ?? true;
    await this.bookmarksProvider.deleteFolderForTools(input.folderId, force);

    return resultFromObject({
      success: true,
      deletedFolderId: input.folderId,
      forced: force
    });
  }
}

export function registerBookmarkAiTools(
  context: vscode.ExtensionContext,
  bookmarksProvider: BookmarksProvider
): void {
  context.subscriptions.push(
    vscode.lm.registerTool('codebench_get_bookmarks', new GetBookmarksTool(bookmarksProvider)),
    vscode.lm.registerTool('codebench_add_bookmark', new AddBookmarkTool(bookmarksProvider)),
    vscode.lm.registerTool('codebench_move_bookmark_to_folder', new MoveBookmarkToFolderTool(bookmarksProvider)),
    vscode.lm.registerTool('codebench_rename_bookmark', new RenameBookmarkTool(bookmarksProvider)),
    vscode.lm.registerTool('codebench_set_bookmark_color', new SetBookmarkColorTool(bookmarksProvider)),
    vscode.lm.registerTool('codebench_remove_bookmark', new RemoveBookmarkTool(bookmarksProvider)),
    vscode.lm.registerTool('codebench_create_bookmark_folder', new CreateBookmarkFolderTool(bookmarksProvider)),
    vscode.lm.registerTool('codebench_remove_bookmark_folder', new RemoveBookmarkFolderTool(bookmarksProvider))
  );
}
