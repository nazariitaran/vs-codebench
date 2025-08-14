import * as vscode from 'vscode';
import { BookmarkTreeItem } from './views/BookmarkTreeItem';
import { BookmarkFolderTreeItem } from './views/BookmarkFolderTreeItem';
import { BookmarkService } from './BookmarkService';
import { BookmarkDecorationService } from './BookmarkDecorationService';
import { Bookmark } from './Models';
import * as path from 'path';

type TreeItem = BookmarkTreeItem | BookmarkFolderTreeItem;

export class BookmarksProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

  private bookmarkService: BookmarkService;
  private decorationService: BookmarkDecorationService;
  private treeView?: vscode.TreeView<TreeItem>;

  constructor(private context: vscode.ExtensionContext) {
    this.bookmarkService = new BookmarkService(context);
    this.decorationService = new BookmarkDecorationService(context);

    // Don't load bookmarks immediately to avoid race condition
    // loadBookmarks will be called after setTreeView() is called

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.updateDecorations();
        this.updateLineHasBookmarkContext();
      })
    );

    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(() => {
        this.updateAllDecorations();
        this.updateLineHasBookmarkContext();
      })
    );

    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection(() => {
        this.updateLineHasBookmarkContext();
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        const modified = await this.bookmarkService.handleTextDocumentChange(event);
        if (modified) {
          this.refresh();
        }
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.loadBookmarks();
      })
    );

    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        // The decoration service already handles theme changes internally,
        // but we need to trigger a refresh to reapply decorations
        this.updateAllDecorations();
      })
    );

    // Watch for file deletion
    context.subscriptions.push(
      vscode.workspace.onDidDeleteFiles(async (event) => {
        const modified = await this.bookmarkService.handleFileDeleted(event.files);
        if (modified) {
          this.refresh();
        }
      })
    );

    // Watch for file rename/move
    context.subscriptions.push(
      vscode.workspace.onDidRenameFiles(async (event) => {
        const modified = await this.bookmarkService.handleFileRenamed(event.files);
        if (modified) {
          this.refresh();
        }
      })
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
    this.updateAllDecorations();
    this.updateTreeViewTitle();
    this.updateLineHasBookmarkContext();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: TreeItem): TreeItem | undefined {
    if (element instanceof BookmarkTreeItem) {
      const bookmark = this.bookmarkService.getBookmarkById(element.id!);
      if (bookmark?.parentId) {
        const folder = this.bookmarkService.findFolder(bookmark.parentId);
        if (folder) {
          const depth = this.bookmarkService.getFolderDepth(folder.id);
          const isAtMaxDepth = depth >= 3;
          return new BookmarkFolderTreeItem(folder.name, folder.id, folder.parentId, folder.isExpanded, isAtMaxDepth);
        }
      }
    } else if (element instanceof BookmarkFolderTreeItem) {
      if (element.parentId) {
        const parentFolder = this.bookmarkService.findFolder(element.parentId);
        if (parentFolder) {
          const depth = this.bookmarkService.getFolderDepth(parentFolder.id);
          const isAtMaxDepth = depth >= 3;
          return new BookmarkFolderTreeItem(parentFolder.name, parentFolder.id, parentFolder.parentId, parentFolder.isExpanded, isAtMaxDepth);
        }
      }
    }
    return undefined;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    const bookmarks = this.bookmarkService.getBookmarks();
    const folders = this.bookmarkService.getFolders();

    if (!element) {
      // Return root level items
      const rootFolders = folders
        .filter(f => !f.parentId)
        .sort((a, b) => a.order - b.order)
        .map(folder => {
          const depth = this.bookmarkService.getFolderDepth(folder.id);
          const isAtMaxDepth = depth >= 3;
          return new BookmarkFolderTreeItem(folder.name, folder.id, folder.parentId, folder.isExpanded, isAtMaxDepth);
        });

      const rootBookmarks = bookmarks
        .filter(b => !b.parentId)
        .sort((a, b) => a.order - b.order)
        .map(bookmark => this.createBookmarkTreeItem(bookmark));

      return [...rootFolders, ...rootBookmarks];
    } else if (element instanceof BookmarkFolderTreeItem) {
      // Return children of this folder
      const childFolders = folders
        .filter(f => f.parentId === element.id)
        .sort((a, b) => a.order - b.order)
        .map(folder => {
          const depth = this.bookmarkService.getFolderDepth(folder.id);
          const isAtMaxDepth = depth >= 3;
          return new BookmarkFolderTreeItem(folder.name, folder.id, folder.parentId, folder.isExpanded, isAtMaxDepth);
        });

      const childBookmarks = bookmarks
        .filter(b => b.parentId === element.id)
        .sort((a, b) => a.order - b.order)
        .map(bookmark => this.createBookmarkTreeItem(bookmark));

      return [...childFolders, ...childBookmarks];
    }

    return [];
  }

  private createBookmarkTreeItem(bookmark: Bookmark): BookmarkTreeItem {
    const uri = vscode.Uri.parse(bookmark.fileUri);
    const fileName = path.basename(uri.fsPath);
    const label = bookmark.text || `Line ${bookmark.line + 1}`;
    const description = `${fileName}:${bookmark.line + 1}`;

    // For root-level bookmarks when folders exist, use None state
    // This ensures consistent alignment with folders
    const collapsibleState = vscode.TreeItemCollapsibleState.None;

    const item = new BookmarkTreeItem(label, description, collapsibleState, bookmark.color);

    const fileExists = this.checkFileExists(uri);
    if (!fileExists) {
      item.setMissingFile();
    }

    item.command = {
      command: 'codebench.jumpToBookmark',
      title: 'Jump to Bookmark',
      arguments: [bookmark]
    };

    item.id = bookmark.id;

    item.parentId = bookmark.parentId;

    return item;
  }

  async addBookmark(fileUri: string, line: number, text: string): Promise<void> {
    await this.bookmarkService.addBookmark(fileUri, line, text);
    this.refresh();
  }

  async editBookmark(id: string, text: string): Promise<void> {
    await this.bookmarkService.editBookmark(id, text);
    this.refresh();
  }

  async deleteBookmark(id: string): Promise<void> {
    await this.bookmarkService.deleteBookmark(id);
    this.refresh();
  }

  async changeBookmarkColor(id: string, color?: string): Promise<void> {
    await this.bookmarkService.changeBookmarkColor(id, color);
    this.refresh();
  }

  async jumpToBookmark(bookmark: Bookmark): Promise<void> {
    const uri = vscode.Uri.parse(bookmark.fileUri);

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      const line = Math.min(bookmark.line, document.lineCount - 1);
      const position = new vscode.Position(line, 0);
      const range = new vscode.Range(position, position);

      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      // Provide more specific error message for missing files
      const fileName = path.basename(uri.fsPath);
      if (error && error.toString().includes('file not found')) {
        vscode.window.showErrorMessage(
          `Cannot jump to bookmark: File "${fileName}" no longer exists at ${uri.fsPath}`
        );
      } else {
        vscode.window.showErrorMessage(`Could not jump to bookmark: ${error}`);
      }
    }
  }

  getBookmarkForLine(fileUri: string, line: number): Bookmark | undefined {
    return this.bookmarkService.getBookmarkForLine(fileUri, line);
  }

  getBookmarksForFile(fileUri: string): Bookmark[] {
    return this.bookmarkService.getBookmarksForFile(fileUri);
  }

  getAllBookmarks(): Bookmark[] {
    return this.bookmarkService.getAllBookmarks();
  }

  getFolders() {
    return this.bookmarkService.getFolders();
  }

  getBookmarkById(id: string): Bookmark | undefined {
    return this.bookmarkService.getBookmarkById(id);
  }

  async addFolder(name: string, parentId?: string): Promise<void> {
    if (parentId) {
      const depth = this.bookmarkService.getFolderDepth(parentId);
      if (depth >= 3) {
        vscode.window.showErrorMessage('Maximum folder depth (3 levels) reached');
        return;
      }
    }

    await this.bookmarkService.addFolder(name, parentId);
    this.refresh();
  }

  async editFolder(id: string, name: string): Promise<void> {
    await this.bookmarkService.editFolder(id, name);
    this.refresh();
  }

  async deleteFolder(id: string): Promise<void> {
    const folder = this.bookmarkService.findFolder(id);
    if (!folder) {
      return;
    }

    const itemCount = this.bookmarkService.countFolderItems(id);

    if (itemCount > 0) {
      const result = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${folder.name}"? This will delete ${itemCount} item(s) including all subfolders and bookmarks.`,
        { modal: true },
        'Delete'
      );

      if (result !== 'Delete') {
        return;
      }
    }

    await this.bookmarkService.deleteFolder(id);
    this.refresh();
  }

  setTreeView(treeView: vscode.TreeView<TreeItem>) {
    this.treeView = treeView;
    this.loadBookmarks();
  }

  async moveToFolder(itemId: string, targetFolderId?: string): Promise<void> {
    try {
      await this.bookmarkService.moveToFolder(itemId, targetFolderId);
      this.refresh();
    } catch (error: any) {
      vscode.window.showErrorMessage(error.message);
    }
  }

  async reorderItems(draggedId: string, targetId: string, dropPosition: 'before' | 'after'): Promise<void> {
    try {
      await this.bookmarkService.reorderItem(draggedId, targetId, dropPosition);
      this.refresh();
    } catch (error: any) {
      vscode.window.showErrorMessage(error.message);
    }
  }

  private async loadBookmarks(): Promise<void> {
    await this.bookmarkService.loadBookmarks();
    this.refresh();
  }

  async clearAll(): Promise<void> {
    await this.bookmarkService.clearAll();
    this.refresh();
  }

  private updateTreeViewTitle(): void {
    if (this.treeView) {
      const bookmarks = this.bookmarkService.getBookmarks();
      const files = new Set(bookmarks.map(b => b.fileUri)).size;
      this.treeView.title = 'Bookmarks';
      this.treeView.description = `${bookmarks.length} in ${files} file${files !== 1 ? 's' : ''}`;
    }
    // If treeView is not set yet, this will be called again when setTreeView() is called
  }

  private updateDecorations(): void {
    if (vscode.window.activeTextEditor) {
      const uri = vscode.window.activeTextEditor.document.uri.toString();
      const bookmarks = this.bookmarkService.getBookmarksForFile(uri);
      this.decorationService.updateFileDecorations(uri, bookmarks);
    }
  }

  private updateAllDecorations(): void {
    const bookmarks = this.bookmarkService.getBookmarks();
    this.decorationService.updateDecorations(bookmarks);
  }

  private async updateLineHasBookmarkContext(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    let has = false;
    if (editor) {
      const uri = editor.document.uri.toString();
      const line = editor.selection.active.line;
      const bm = this.bookmarkService.getBookmarkForLine(uri, line);
      has = !!bm;
    }
    await vscode.commands.executeCommand('setContext', 'codebench.lineHasBookmark', has);
  }

  private checkFileExists(uri: vscode.Uri): boolean {
    try {
      // Try to stat the file to check if it exists
      // We use a synchronous check here since we're in the tree creation
      // and need immediate feedback
      const fs = require('fs');
      return fs.existsSync(uri.fsPath);
    } catch {
      return false;
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.decorationService.dispose();
  }
}
