import * as vscode from 'vscode';
import { ScratchpadsProvider } from '../ScratchpadsProvider';
import { ScratchpadItem } from './ScratchpadItem';
import { ScratchpadFolderTreeItem } from './ScratchpadFolderTreeItem';

type TreeItem = ScratchpadItem | ScratchpadFolderTreeItem;

export class ScratchpadDragAndDropController implements vscode.TreeDragAndDropController<TreeItem> {
  dropMimeTypes = ['application/vnd.code.tree.scratchpadsView'];
  dragMimeTypes = ['text/uri-list'];

  constructor(private provider: ScratchpadsProvider) {}

  public async handleDrag(
    source: readonly TreeItem[],
    treeDataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const item = source[0];
    if (!item) {
      return;
    }

    const isFolder = item instanceof ScratchpadFolderTreeItem;
    const id = isFolder ? (item as ScratchpadFolderTreeItem).id : (item as ScratchpadItem).scratchFile?.id;
    if (!id) {
      return;
    }

    treeDataTransfer.set(
      'application/vnd.code.tree.scratchpadsView',
      new vscode.DataTransferItem(JSON.stringify({ id, isFolder }))
    );
  }

  public async handleDrop(
    target: TreeItem | undefined,
    sources: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = sources.get('application/vnd.code.tree.scratchpadsView');
    if (!transferItem) {
      return;
    }

    try {
      const dragData = JSON.parse(transferItem.value);
      const draggedId: string | undefined = dragData.id;
      const isDraggedFolder: boolean = dragData.isFolder;
      if (!draggedId) {
        return;
      }

      // Determine target folder ID
      let targetFolderId: string | undefined;
      if (target instanceof ScratchpadFolderTreeItem) {
        targetFolderId = (target as ScratchpadFolderTreeItem).id;
      } else if (target instanceof ScratchpadItem) {
        // Dropping on a file → reorder within same folder
        targetFolderId = target.parentId;
      }
      // Dropping on empty space (target is undefined) → move to root

      // If dropping on a folder at max depth, reject folder moves
      if (target instanceof ScratchpadFolderTreeItem && isDraggedFolder && (target as ScratchpadFolderTreeItem).isAtMaxDepth) {
        return;
      }

      const draggedFile = this.provider.scratchpadService.getScratchFile(draggedId);
      const draggedFolder = this.provider.scratchpadService.getFolderById(draggedId);

      if (draggedFile) {
        // Dropping a file
        if (target instanceof ScratchpadFolderTreeItem) {
          // Move to folder
          await this.provider.moveToFolder(draggedId, targetFolderId);
        } else if (target instanceof ScratchpadItem) {
          // Reorder relative to target file (dropping before the target)
          await this.provider.reorderItem(draggedId, target.scratchFile.id, 'before');
        } else {
          // Drop on empty space → move to root
          await this.provider.moveToFolder(draggedId, undefined);
        }
      } else if (draggedFolder) {
        // Dropping a folder
        if (target instanceof ScratchpadFolderTreeItem) {
          // Move folder into target folder
          await this.provider.moveToFolder(draggedId, targetFolderId);
        } else if (target instanceof ScratchpadItem) {
          // Move folder to same parent as target file (reorder)
          await this.provider.moveToFolder(draggedId, target.parentId);
        } else {
          // Drop on empty space → move to root
          await this.provider.moveToFolder(draggedId, undefined);
        }
      }
    } catch (error) {
      console.error('Error handling scratchpad drop:', error);
    }
  }
}


