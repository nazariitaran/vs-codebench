import * as vscode from 'vscode';
import { BookmarkTreeItem } from './BookmarkTreeItem';
import { BookmarkFolderTreeItem } from './BookmarkFolderTreeItem';
import { BookmarksProvider } from '../BookmarksProvider';

type TreeItem = BookmarkTreeItem | BookmarkFolderTreeItem;

export class BookmarkDragAndDropController implements vscode.TreeDragAndDropController<TreeItem> {
  dropMimeTypes = ['application/vnd.code.tree.bookmarksView'];
  dragMimeTypes = ['text/uri-list'];

  constructor(private provider: BookmarksProvider) { }

  public async handleDrag(
    source: readonly TreeItem[],
    treeDataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Store the item ID and type in the data transfer
    const item = source[0];
    if (item.id) {
      const dragData = {
        id: item.id,
        type: item instanceof BookmarkFolderTreeItem ? 'folder' : 'bookmark'
      };
      treeDataTransfer.set('application/vnd.code.tree.bookmarksView',
        new vscode.DataTransferItem(JSON.stringify(dragData)));
    }
  }

  public async handleDrop(
    target: TreeItem | undefined,
    sources: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = sources.get('application/vnd.code.tree.bookmarksView');
    if (!transferItem) {
      return;
    }

    try {
      const dragData = JSON.parse(transferItem.value);
      const draggedId = dragData.id;

      if (!draggedId) {
        return;
      }

      // If dropped on a folder, move into that folder
      if (target instanceof BookmarkFolderTreeItem) {
        await this.provider.moveToFolder(draggedId, target.id);
      }
      // If dropped on a bookmark, reorder within the same parent
      else if (target instanceof BookmarkTreeItem) {
        await this.provider.reorderItems(draggedId, target.id!, 'before');
      }
      // If dropped on empty space (target is undefined), move to root
      else {
        await this.provider.moveToFolder(draggedId, undefined);
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  }
}
