import * as vscode from 'vscode';
import { TodoTreeItem } from './TodoTreeItem';
import { TodosProvider } from '../TodosProvider';

export class TodoDragAndDropController implements vscode.TreeDragAndDropController<TodoTreeItem> {
  dropMimeTypes = ['application/vnd.code.tree.todosView'];
  dragMimeTypes = ['text/uri-list'];

  constructor(private provider: TodosProvider) { }

  public async handleDrag(
    source: readonly TodoTreeItem[],
    treeDataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    treeDataTransfer.set('application/vnd.code.tree.todosView',
      new vscode.DataTransferItem(source[0].todo));
  }

  public async handleDrop(
    target: TodoTreeItem | undefined,
    sources: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = sources.get('application/vnd.code.tree.todosView');
    if (!transferItem) {
      return;
    }

    const draggedTodo = transferItem.value;
    if (!draggedTodo || !target) {
      return;
    }

    // Prevent dropping a parent into its own child
    if (this.isAncestor(draggedTodo.id, target.todo.id)) {
      vscode.window.showWarningMessage('Cannot move a todo into its own sub-todo');
      return;
    }

    await this.provider.reorderTodo(draggedTodo.id, target.todo.id);
  }

  private isAncestor(ancestorId: string, descendantId: string): boolean {
    const todos = this.provider.getTodos();

    const checkAncestry = (currentId: string): boolean => {
      if (currentId === ancestorId) {
        return true;
      }

      const current = todos.find((t: any) => t.id === currentId);
      if (!current || !current.parentId) {
        return false;
      }

      return checkAncestry(current.parentId);
    };

    return checkAncestry(descendantId);
  }
}
