import * as vscode from 'vscode';
import { ScratchpadsProvider } from '../ScratchpadsProvider';
import { ScratchpadItem } from './ScratchpadItem';

export class ScratchpadDragAndDropController implements vscode.TreeDragAndDropController<ScratchpadItem> {
  dropMimeTypes = ['application/vnd.code.tree.scratchpadsView'];
  dragMimeTypes = ['text/uri-list'];

  constructor(private provider: ScratchpadsProvider) {}

  public async handleDrag(
    source: readonly ScratchpadItem[],
    treeDataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const item = source[0];
    if (!item?.scratchFile?.id) {
      return;
    }
    treeDataTransfer.set(
      'application/vnd.code.tree.scratchpadsView',
      new vscode.DataTransferItem(JSON.stringify({ id: item.scratchFile.id }))
    );
  }

  public async handleDrop(
    target: ScratchpadItem | undefined,
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
      if (!draggedId) {
        return;
      }

      const targetId = target?.scratchFile?.id;
      if (targetId === draggedId) {
        return;
      }

      await this.provider.reorderScratchpad(draggedId, targetId);
    } catch (error) {
      console.error('Error handling scratchpad drop:', error);
    }
  }
}


