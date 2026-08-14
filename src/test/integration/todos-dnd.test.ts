import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoDragAndDropController } from '../../features/todos/views/TodoDragAndDropController';
import { TodoTreeItem } from '../../features/todos/views/TodoTreeItem';

suite('Todos: drag-and-drop controller', () => {
  let extension: vscode.Extension<any>;

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    if (!extension.isActive) {
      await extension.activate();
    }
  });

  test('handleDrop reorders siblings onto the drop target', async function () {
    this.timeout(20000);
    const { todosProvider } = extension.exports as any;

    for (const t of [...todosProvider.getTodos()]) {
      await todosProvider.deleteTodo(t.id);
    }

    await todosProvider.addTodo('A');
    await todosProvider.addTodo('B');
    await todosProvider.addTodo('C');
    const root = todosProvider.getTodos().filter((t: any) => !t.parentId);
    const B = root.find((t: any) => t.text === 'B');
    const C = root.find((t: any) => t.text === 'C');

    const controller = new TodoDragAndDropController(todosProvider);
    const transfer = new vscode.DataTransfer();
    const token = new vscode.CancellationTokenSource().token;

    await controller.handleDrag([new TodoTreeItem(C)], transfer, token);
    await controller.handleDrop(new TodoTreeItem(B), transfer, token);

    const orderAfter = todosProvider.getTodos().filter((t: any) => !t.parentId).map((t: any) => t.text);
    assert.deepStrictEqual(orderAfter, ['A', 'C', 'B']);
  });
});
