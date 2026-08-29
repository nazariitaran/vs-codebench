import * as vscode from 'vscode';
import { BOOKMARK_COLORS, BookmarkColorName } from '../bookmarks/Models';
import BookmarkValidator from '../bookmarks/BookmarkValidator';
import { BookmarksProvider } from '../bookmarks/BookmarksProvider';

export interface GetBookmarksInput {
  fileUri?: string;
  folderId?: string;
  includeFolders?: boolean;
}

export interface AddBookmarkInput {
  fileUri: string;
  line: number;
  text?: string;
}

export interface MoveBookmarkToFolderInput {
  bookmarkId: string;
  folderId: string;
}

export interface RenameBookmarkInput {
  bookmarkId: string;
  text: string;
}

export interface SetBookmarkColorInput {
  bookmarkId: string;
  color: BookmarkColorName;
}

export interface RemoveBookmarkInput {
  bookmarkId: string;
}

export interface CreateBookmarkFolderInput {
  name: string;
  parentFolderId?: string;
}

export interface RemoveBookmarkFolderInput {
  folderId: string;
  force?: boolean;
}

export function normalizeFileUri(fileUriOrPath: string): string {
  if (!fileUriOrPath || fileUriOrPath.trim().length === 0) {
    throw new Error('fileUri must be provided. Use an absolute path or file:// URI.');
  }

  if (fileUriOrPath.startsWith('file://')) {
    return vscode.Uri.parse(fileUriOrPath).toString();
  }

  return vscode.Uri.file(fileUriOrPath).toString();
}

export async function getBookmarks(bookmarksProvider: BookmarksProvider, input: GetBookmarksInput = {}) {
  const fileUri = input.fileUri ? normalizeFileUri(input.fileUri) : undefined;
  const includeFolders = input.includeFolders ?? true;

  let bookmarks = bookmarksProvider.getAllBookmarks();
  if (fileUri) {
    bookmarks = bookmarks.filter(bookmark => bookmark.fileUri === fileUri);
  }
  if (input.folderId) {
    bookmarks = bookmarks.filter(bookmark => bookmark.parentId === input.folderId);
  }

  const folders = includeFolders
    ? bookmarksProvider.getFolders().filter(folder => {
      if (input.folderId) {
        return folder.id === input.folderId || folder.parentId === input.folderId;
      }
      return true;
    })
    : [];

  return {
    count: bookmarks.length,
    bookmarks,
    folders
  };
}

export async function addBookmark(bookmarksProvider: BookmarksProvider, input: AddBookmarkInput) {
  if (!Number.isInteger(input.line) || input.line < 0) {
    throw new Error('line must be a non-negative integer and is zero-based.');
  }

  const countError = BookmarkValidator.validateTotalCount(bookmarksProvider.getAllBookmarks());
  if (countError) {
    throw new Error(countError);
  }

  const fileUri = normalizeFileUri(input.fileUri);
  const existingBookmark = bookmarksProvider.getBookmarkForLine(fileUri, input.line);
  if (existingBookmark) {
    throw new Error('Bookmark already exists at this line.');
  }

  const text = (input.text ?? `Line ${input.line + 1}`).trim();
  const textError = BookmarkValidator.validateText(text);
  if (textError) {
    throw new Error(textError);
  }

  await bookmarksProvider.addBookmark(fileUri, input.line, text);
  const created = bookmarksProvider.getBookmarkForLine(fileUri, input.line);

  return {
    success: true,
    bookmark: created
  };
}

export async function moveBookmarkToFolder(bookmarksProvider: BookmarksProvider, input: MoveBookmarkToFolderInput) {
  const bookmark = bookmarksProvider.getBookmarkById(input.bookmarkId);
  if (!bookmark) {
    throw new Error('Bookmark not found. Provide a valid bookmarkId from get_bookmarks results.');
  }

  const folder = bookmarksProvider.getFolders().find(f => f.id === input.folderId);
  if (!folder) {
    throw new Error('Folder not found. Provide a valid folderId from get_bookmarks results.');
  }

  await bookmarksProvider.moveToFolder(input.bookmarkId, folder.id);
  const updated = bookmarksProvider.getBookmarkById(input.bookmarkId);

  return {
    success: true,
    bookmark: updated
  };
}

export async function renameBookmark(bookmarksProvider: BookmarksProvider, input: RenameBookmarkInput) {
  const bookmark = bookmarksProvider.getBookmarkById(input.bookmarkId);
  if (!bookmark) {
    throw new Error('Bookmark not found.');
  }

  const textError = BookmarkValidator.validateText(input.text ?? '');
  if (textError) {
    throw new Error(textError);
  }

  await bookmarksProvider.editBookmark(input.bookmarkId, input.text);
  const updated = bookmarksProvider.getBookmarkById(input.bookmarkId);

  return {
    success: true,
    bookmark: updated
  };
}

export async function setBookmarkColor(bookmarksProvider: BookmarksProvider, input: SetBookmarkColorInput) {
  const bookmark = bookmarksProvider.getBookmarkById(input.bookmarkId);
  if (!bookmark) {
    throw new Error('Bookmark not found.');
  }

  const isValidColor = Object.keys(BOOKMARK_COLORS).includes(input.color);
  if (!isValidColor) {
    throw new Error('Invalid bookmark color. Allowed values: default, red, green, yellow, and purple.');
  }

  const color = input.color === 'default' ? undefined : input.color;
  await bookmarksProvider.changeBookmarkColor(input.bookmarkId, color);
  const updated = bookmarksProvider.getBookmarkById(input.bookmarkId);

  return {
    success: true,
    bookmark: updated
  };
}

export async function removeBookmark(bookmarksProvider: BookmarksProvider, input: RemoveBookmarkInput) {
  const bookmark = bookmarksProvider.getBookmarkById(input.bookmarkId);
  if (!bookmark) {
    throw new Error('Bookmark not found.');
  }

  await bookmarksProvider.deleteBookmark(input.bookmarkId);

  return {
    success: true,
    deletedBookmarkId: input.bookmarkId
  };
}

export async function createBookmarkFolder(bookmarksProvider: BookmarksProvider, input: CreateBookmarkFolderInput) {
  const nameError = BookmarkValidator.validateFolderName(input.name ?? '');
  if (nameError) {
    throw new Error(nameError);
  }

  if (input.parentFolderId) {
    const parent = bookmarksProvider.getFolders().find(f => f.id === input.parentFolderId);
    if (!parent) {
      throw new Error('Parent folder not found.');
    }
    const depth = bookmarksProvider.getFolderDepth(input.parentFolderId);
    if (depth >= 3) {
      throw new Error('Maximum folder depth (3 levels) reached.');
    }
  }

  await bookmarksProvider.addFolder(input.name, input.parentFolderId);
  const createdFolder = bookmarksProvider.getFolders()
    .find(folder => folder.name === input.name.trim() && folder.parentId === input.parentFolderId);

  return {
    success: true,
    folder: createdFolder
  };
}

export async function removeBookmarkFolder(bookmarksProvider: BookmarksProvider, input: RemoveBookmarkFolderInput) {
  const folder = bookmarksProvider.getFolders().find(f => f.id === input.folderId);
  if (!folder) {
    throw new Error('Folder not found.');
  }

  const force = input.force ?? true;
  await bookmarksProvider.deleteFolderForTools(input.folderId, force);

  return {
    success: true,
    deletedFolderId: input.folderId,
    forced: force
  };
}
