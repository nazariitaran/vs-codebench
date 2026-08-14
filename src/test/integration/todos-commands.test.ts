import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Todos: command-driven flows', () => {
  let extension: vscode.Extension<any>;

  const stubs: { restore: () => void }[] = [];
  const stub = <T extends object, K extends keyof T>(obj: T, key: K, impl: any) => {
    const original = (obj as any)[key];
    (obj as any)[key] = impl;
    stubs.push({ restore: () => { (obj as any)[key] = original; } });
  };

  setup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    if (!extension.isActive) {
      await extension.activate();
    }
  });

  teardown(() => {
    while (stubs.length) {
      stubs.pop()!.restore();
    }
  });

  test('Add, sub-task, toggle, rename, delete via commands and verify stats', async function () {
    this.timeout(20000);
    const { todosProvider } = extension.exports as any;
    assert.ok(todosProvider, 'todosProvider should be available');

    const existing = [...todosProvider.getTodos()];
    for (const t of existing) {
      await todosProvider.deleteTodo(t.id);
    }

    stub(vscode.window, 'showInputBox', async () => 'Implement error handling');
    await vscode.commands.executeCommand('vs-codebench.addTodo');
    stub(vscode.window, 'showInputBox', async () => 'Write unit tests');
    await vscode.commands.executeCommand('vs-codebench.addTodo');

    let todos = todosProvider.getTodos();
    assert.strictEqual(todos.length, 2, 'Should have 2 todos');

    const rootItems = await todosProvider.getChildren();
    const parentItem = rootItems.find((item: any) => item.todo.text === 'Write unit tests');
    assert.ok(parentItem, 'Parent todo tree item should exist');

    stub(vscode.window, 'showInputBox', async () => 'Test edge cases');
    await vscode.commands.executeCommand('vs-codebench.addSubTodo', parentItem);

    const child = todosProvider.getTodos().find((t: any) => t.parentId === parentItem.todo.id);
    assert.ok(child, 'Sub-todo should be created via command');

    const childItems = await todosProvider.getChildren(parentItem);
    const childItem = childItems.find((item: any) => item.todo.id === child.id);
    assert.ok(childItem, 'Child todo tree item should exist');

    await vscode.commands.executeCommand('vs-codebench.toggleTodo', parentItem);
    await vscode.commands.executeCommand('vs-codebench.toggleTodo', childItem);

    const stats = todosProvider.getTodoStats();
    assert.strictEqual(stats.completed, 2, 'Parent and child should be completed');

    stub(vscode.window, 'showInputBox', async () => 'Write unit tests (renamed)');
    await vscode.commands.executeCommand('vs-codebench.editTodo', parentItem);

    await vscode.commands.executeCommand('vs-codebench.deleteTodo', childItem);

    todos = todosProvider.getTodos();
    assert.ok(todos.find((t: any) => t.id === parentItem.todo.id && t.text.includes('(renamed)')));
    assert.ok(!todos.find((t: any) => t.id === child.id));
  });
});
