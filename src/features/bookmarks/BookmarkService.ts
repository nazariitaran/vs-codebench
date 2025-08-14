import { Bookmark, BookmarkFolder, BookmarkData, CURRENT_BOOKMARK_VERSION } from './Models';
import { NamespacedStorageService, createNamespacedStorage } from '../../common/storage/StorageService';
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

export class BookmarkService {
  private bookmarks: Bookmark[] = [];
  private folders: BookmarkFolder[] = [];
  private storage: NamespacedStorageService;

  constructor(context: vscode.ExtensionContext) {
    this.storage = createNamespacedStorage(context, 'bookmarks');
  }

  async loadBookmarks(): Promise<void> {
    const data = await this.storage.retrieve<BookmarkData>('data', {
      version: CURRENT_BOOKMARK_VERSION,
      bookmarks: [],
      folders: []
    }, { scope: 'auto' });

    this.bookmarks = data.bookmarks || [];
    this.folders = data.folders || [];

    if (data.version < 3) {
      this.folders = [];
      await this.saveBookmarks();
    }
  }

  async saveBookmarks(): Promise<void> {
    await this.storage.store('data', {
      version: CURRENT_BOOKMARK_VERSION,
      bookmarks: this.bookmarks,
      folders: this.folders
    }, { scope: 'auto' });
  }

  getBookmarks(): Bookmark[] {
    return this.bookmarks;
  }

  getFolders(): BookmarkFolder[] {
    return this.folders;
  }

  async addBookmark(fileUri: string, line: number, text: string): Promise<Bookmark> {
    // Calculate order as max + 1 to ensure new bookmarks go to the end
    const siblings = this.getFolderSiblings(undefined);
    const maxOrder = siblings.length > 0 
      ? Math.max(...siblings.map(s => s.order)) 
      : -1;
    
    const newBookmark: Bookmark = {
      id: uuidv4(),
      fileUri,
      line,
      text: text.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: maxOrder + 1
    };

    this.bookmarks.push(newBookmark);
    await this.saveBookmarks();
    return newBookmark;
  }

  async editBookmark(id: string, text: string): Promise<void> {
    const bookmark = this.bookmarks.find(b => b.id === id);
    if (bookmark) {
      bookmark.text = text.trim();
      bookmark.updatedAt = Date.now();
      await this.saveBookmarks();
    }
  }

  async deleteBookmark(id: string): Promise<void> {
    // Find the bookmark's parent before deleting
    const bookmark = this.bookmarks.find(b => b.id === id);
    if (!bookmark) {
      return;
    }
    
    const parentId = bookmark.parentId;
    
    // Delete the bookmark
    this.bookmarks = this.bookmarks.filter(b => b.id !== id);
    
    // Normalize order in the parent context after deletion (including root level)
    const siblings = this.getFolderSiblings(parentId);
    siblings.sort((a, b) => a.order - b.order);
    siblings.forEach((item, index) => { item.order = index; });
    
    await this.saveBookmarks();
  }

  async changeBookmarkColor(id: string, colorName?: string): Promise<void> {
    const bookmark = this.bookmarks.find(b => b.id === id);
    if (bookmark) {
      bookmark.color = colorName;
      bookmark.updatedAt = Date.now();
      await this.saveBookmarks();
    }
  }

  getBookmarkById(id: string): Bookmark | undefined {
    return this.bookmarks.find(b => b.id === id);
  }

  getBookmarkForLine(fileUri: string, line: number): Bookmark | undefined {
    return this.bookmarks.find(b => b.fileUri === fileUri && b.line === line);
  }

  getBookmarksForFile(fileUri: string): Bookmark[] {
    return this.bookmarks.filter(b => b.fileUri === fileUri);
  }

  getAllBookmarks(): Bookmark[] {
    return this.bookmarks;
  }

  async addFolder(name: string, parentId?: string): Promise<BookmarkFolder> {
    // Calculate order as max + 1 to ensure new folders go to the end
    const siblings = this.getFolderSiblings(parentId);
    const maxOrder = siblings.length > 0 
      ? Math.max(...siblings.map(s => s.order)) 
      : -1;
    
    const newFolder: BookmarkFolder = {
      id: uuidv4(),
      name: name.trim(),
      parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: maxOrder + 1,
      isExpanded: true
    };

    this.folders.push(newFolder);
    await this.saveBookmarks();
    return newFolder;
  }

  async editFolder(id: string, name: string): Promise<void> {
    const folder = this.folders.find(f => f.id === id);
    if (folder) {
      folder.name = name.trim();
      folder.updatedAt = Date.now();
      await this.saveBookmarks();
    }
  }

  async deleteFolder(id: string): Promise<void> {
    // Find the folder's parent before deleting
    const folder = this.folders.find(f => f.id === id);
    if (!folder) {
      return;
    }
    
    const parentId = folder.parentId;
    
    // Delete the folder and its contents
    this.deleteFolderRecursive(id);
    
    // Normalize order in the parent context after deletion (including root level)
    const siblings = this.getFolderSiblings(parentId);
    siblings.sort((a, b) => a.order - b.order);
    siblings.forEach((item, index) => { item.order = index; });
    
    await this.saveBookmarks();
  }

  private deleteFolderRecursive(folderId: string): void {
    // Delete all bookmarks in this folder
    this.bookmarks = this.bookmarks.filter(b => b.parentId !== folderId);

    // Find and delete all subfolders
    const subfolders = this.folders.filter(f => f.parentId === folderId);
    for (const subfolder of subfolders) {
      this.deleteFolderRecursive(subfolder.id);
    }

    // Delete the folder itself
    this.folders = this.folders.filter(f => f.id !== folderId);
  }

  getFolderDepth(folderId: string): number {
    let depth = 1;
    let currentId: string | undefined = folderId;

    while (currentId) {
      const folder = this.folders.find(f => f.id === currentId);
      if (folder?.parentId) {
        depth++;
        currentId = folder.parentId;
      } else {
        currentId = undefined;
      }
    }

    return depth;
  }

  private getFolderSiblings(parentId?: string): (Bookmark | BookmarkFolder)[] {
    const folders = this.folders.filter(f => f.parentId === parentId);
    const bookmarks = this.bookmarks.filter(b => b.parentId === parentId);
    return [...folders, ...bookmarks];
  }

  countFolderItems(folderId: string): number {
    let count = 0;

    // Count bookmarks in this folder
    count += this.bookmarks.filter(b => b.parentId === folderId).length;

    // Count subfolders and their contents
    const subfolders = this.folders.filter(f => f.parentId === folderId);
    for (const subfolder of subfolders) {
      count += 1; // Count the subfolder itself
      count += this.countFolderItems(subfolder.id); // Count its contents
    }

    return count;
  }

  findFolder(id: string): BookmarkFolder | undefined {
    return this.folders.find(f => f.id === id);
  }

  async moveToFolder(itemId: string, targetFolderId?: string): Promise<void> {
    // Check if moving a bookmark
    const bookmark = this.bookmarks.find(b => b.id === itemId);
    if (bookmark) {
      const sourceParentId = bookmark.parentId;
      
      // Calculate order for target folder
      const targetSiblings = this.getFolderSiblings(targetFolderId);
      const maxOrder = targetSiblings.length > 0 
        ? Math.max(...targetSiblings.map(s => s.order)) 
        : -1;
      
      // Move the bookmark
      bookmark.parentId = targetFolderId;
      bookmark.updatedAt = Date.now();
      bookmark.order = maxOrder + 1;
      
      // Normalize source parent if different from target
      if (sourceParentId !== targetFolderId) {
        const sourceSiblings = this.getFolderSiblings(sourceParentId);
        sourceSiblings.sort((a, b) => a.order - b.order);
        sourceSiblings.forEach((item, index) => { item.order = index; });
      }
      
      await this.saveBookmarks();
      return;
    }

    // Check if moving a folder
    const folder = this.folders.find(f => f.id === itemId);
    if (folder) {
      // Prevent moving folder into itself or its descendants
      if (targetFolderId && this.isDescendantOf(targetFolderId, itemId)) {
        throw new Error('Cannot move folder into itself or its subfolders');
      }

      // Check depth if moving to another folder
      if (targetFolderId) {
        const targetDepth = this.getFolderDepth(targetFolderId);
        const folderDepth = this.getMaxFolderDepth(itemId);
        if (targetDepth + folderDepth > 3) {
          throw new Error('Moving this folder would exceed maximum depth (3 levels)');
        }
      }
      
      const sourceParentId = folder.parentId;
      
      // Calculate order for target folder
      const targetSiblings = this.getFolderSiblings(targetFolderId);
      const maxOrder = targetSiblings.length > 0 
        ? Math.max(...targetSiblings.map(s => s.order)) 
        : -1;

      // Move the folder
      folder.parentId = targetFolderId;
      folder.updatedAt = Date.now();
      folder.order = maxOrder + 1;
      
      // Normalize source parent if different from target
      if (sourceParentId !== targetFolderId) {
        const sourceSiblings = this.getFolderSiblings(sourceParentId);
        sourceSiblings.sort((a, b) => a.order - b.order);
        sourceSiblings.forEach((item, index) => { item.order = index; });
      }
      
      await this.saveBookmarks();
    }
  }

  private isDescendantOf(possibleDescendantId: string, ancestorId: string): boolean {
    let currentId: string | undefined = possibleDescendantId;

    while (currentId) {
      if (currentId === ancestorId) {
        return true;
      }
      const folder = this.folders.find(f => f.id === currentId);
      currentId = folder?.parentId;
    }

    return false;
  }

  private getMaxFolderDepth(folderId: string): number {
    let maxDepth = 1;

    const subfolders = this.folders.filter(f => f.parentId === folderId);
    for (const subfolder of subfolders) {
      const subfolderDepth = this.getMaxFolderDepth(subfolder.id);
      maxDepth = Math.max(maxDepth, subfolderDepth + 1);
    }

    return maxDepth;
  }

  async reorderItem(draggedId: string, targetId: string, dropPosition: 'before' | 'after'): Promise<void> {
    // Identify items
    const draggedBookmark = this.bookmarks.find(b => b.id === draggedId);
    const draggedFolder = this.folders.find(f => f.id === draggedId);
    if (!draggedBookmark && !draggedFolder) {
      throw new Error('Dragged item not found');
    }

    const targetBookmark = this.bookmarks.find(b => b.id === targetId);
    const targetFolder = this.folders.find(f => f.id === targetId);
    if (!targetBookmark && !targetFolder) {
      throw new Error('Target item not found');
    }

    // Store the source parent ID before moving
    const sourceParentId = draggedBookmark ? draggedBookmark.parentId : draggedFolder!.parentId;
    const targetParentId = targetBookmark ? targetBookmark.parentId : targetFolder!.parentId;

    // Validate folder moves and depth constraints before mutating arrays
    if (draggedFolder) {
      if (targetParentId && this.isDescendantOf(targetParentId, draggedFolder.id)) {
        throw new Error('Cannot move folder into itself or its subfolders');
      }
      if (targetParentId) {
        const targetDepth = this.getFolderDepth(targetParentId);
        const folderDepth = this.getMaxFolderDepth(draggedFolder.id);
        if (targetDepth + folderDepth > 3) {
          throw new Error('Moving this folder would exceed maximum depth (3 levels)');
        }
      }
    }

    // Remove dragged item from its current collection first
    if (draggedBookmark) {
      this.bookmarks = this.bookmarks.filter(b => b.id !== draggedBookmark.id);
      // Update parent to the new target parent
      draggedBookmark.parentId = targetParentId;
      draggedBookmark.updatedAt = Date.now();
    } else if (draggedFolder) {
      this.folders = this.folders.filter(f => f.id !== draggedFolder.id);
      draggedFolder.parentId = targetParentId;
      draggedFolder.updatedAt = Date.now();
    }

    // If moving between different parents, normalize the source parent's remaining items
    if (sourceParentId !== targetParentId) {
      const sourceFolders = this.folders.filter(f => f.parentId === sourceParentId);
      const sourceBookmarks = this.bookmarks.filter(b => b.parentId === sourceParentId);
      const sourceItems: Array<Bookmark | BookmarkFolder> = [...sourceFolders, ...sourceBookmarks]
        .sort((a, b) => a.order - b.order);
      
      // Normalize order in source parent
      sourceItems.forEach((item, index) => { item.order = index; });
    }

    // Rebuild target parent items (now without the dragged item)
    const foldersInParent = this.folders.filter(f => f.parentId === targetParentId);
    const bookmarksInParent = this.bookmarks.filter(b => b.parentId === targetParentId);
    const allItems: Array<Bookmark | BookmarkFolder> = [...foldersInParent, ...bookmarksInParent]
      .sort((a, b) => a.order - b.order);

    const targetIndex = allItems.findIndex(item => item.id === targetId);
    if (targetIndex === -1) {
      throw new Error('Target not found in items list');
    }

    // Insert dragged item at the proper position relative to target
    const insertIndex = dropPosition === 'after' ? targetIndex + 1 : targetIndex;
    const draggedItem = (draggedBookmark ?? draggedFolder)!;
    allItems.splice(insertIndex, 0, draggedItem);

    // Normalize order in target parent
    allItems.forEach((item, index) => { item.order = index; });

    // Split back into bookmarks and folders arrays while preserving others outside target parent
    const itemIdsInParent = new Set(allItems.map(i => i.id));

    // Update bookmarks array
    this.bookmarks = [
      ...this.bookmarks.filter(b => b.parentId !== targetParentId),
      ...allItems.filter((i): i is Bookmark => (i as any).fileUri !== undefined)
    ];

    // Update folders array
    this.folders = [
      ...this.folders.filter(f => f.parentId !== targetParentId),
      ...allItems.filter((i): i is BookmarkFolder => (i as any).name !== undefined && (i as any).fileUri === undefined)
    ];

    await this.saveBookmarks();
  }

  async handleTextDocumentChange(event: vscode.TextDocumentChangeEvent): Promise<boolean> {
    let modified = false;
    const uri = event.document.uri.toString();
    const bookmarksInFile = this.getBookmarksForFile(uri);

    if (bookmarksInFile.length === 0) {
      return false;
    }

    for (const change of event.contentChanges) {
      const startLine = change.range.start.line;
      const endLine = change.range.end.line;
      const linesDelta = change.text.split('\n').length - 1 - (endLine - startLine);

      if (linesDelta !== 0) {
        // Process bookmarks in reverse order to avoid index issues when deleting
        const bookmarksToProcess = [...bookmarksInFile].reverse();

        for (const bookmark of bookmarksToProcess) {
          if (bookmark.line > endLine) {
            // Bookmark is after the change - shift it
            bookmark.line += linesDelta;
            bookmark.updatedAt = Date.now();
            modified = true;
          } else if (bookmark.line >= startLine && bookmark.line <= endLine) {
            // Bookmark is within the changed range
            if (linesDelta < 0) {
              // Lines were deleted - remove bookmarks in deleted range
              this.bookmarks = this.bookmarks.filter(b => b.id !== bookmark.id);
              modified = true;
            }
          } else if (bookmark.line === startLine && linesDelta > 0 && change.range.start.character === 0) {
            // Enter pressed at beginning of bookmarked line - move bookmark down
            bookmark.line += linesDelta;
            bookmark.updatedAt = Date.now();
            modified = true;
          } else if (bookmark.line === startLine && linesDelta < 0 && change.range.start.character === 0) {
            // Backspace at beginning of bookmarked line - try to move up
            const targetLine = bookmark.line - 1;
            if (targetLine >= 0) {
              const existingBookmark = this.getBookmarkForLine(uri, targetLine);
              if (!existingBookmark) {
                // No collision - move bookmark up
                bookmark.line = targetLine;
                bookmark.updatedAt = Date.now();
                modified = true;
              } else {
                // Collision detected - remove the moving bookmark
                this.bookmarks = this.bookmarks.filter(b => b.id !== bookmark.id);
                modified = true;
              }
            } else {
              // Can't move above line 0 - remove bookmark
              this.bookmarks = this.bookmarks.filter(b => b.id !== bookmark.id);
              modified = true;
            }
          }
        }
      }
    }

    if (modified) {
      await this.saveBookmarks();
    }

    return modified;
  }

  async clearAll(): Promise<void> {
    if (this.bookmarks.length === 0 && this.folders.length === 0) {
      return;
    }
    this.bookmarks = [];
    this.folders = [];
    await this.saveBookmarks();
  }

  async handleFileDeleted(files: readonly vscode.Uri[]): Promise<boolean> {
    let modified = false;

    for (const file of files) {
      const fileUri = file.toString();
      const bookmarksToDelete = this.bookmarks.filter(b => b.fileUri === fileUri);

      if (bookmarksToDelete.length > 0) {
        this.bookmarks = this.bookmarks.filter(b => b.fileUri !== fileUri);
        modified = true;
      }
    }

    if (modified) {
      await this.saveBookmarks();
    }

    return modified;
  }

  async handleFileRenamed(files: readonly { oldUri: vscode.Uri; newUri: vscode.Uri }[]): Promise<boolean> {
    let modified = false;

    for (const { oldUri, newUri } of files) {
      const oldFileUri = oldUri.toString();
      const newFileUri = newUri.toString();

      const bookmarksToUpdate = this.bookmarks.filter(b => b.fileUri === oldFileUri);

      if (bookmarksToUpdate.length > 0) {
        bookmarksToUpdate.forEach(bookmark => {
          bookmark.fileUri = newFileUri;
          bookmark.updatedAt = Date.now();
        });
        modified = true;
      }
    }

    if (modified) {
      await this.saveBookmarks();
    }

    return modified;
  }
}
