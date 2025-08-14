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

    // Clean existing todos to avoid cross-test interference
    const existing = [...todosProvider.getTodos()];
    for (const t of existing) {
      await todosProvider.deleteTodo(t.id);
    }

    // Add two todos via command
    stub(vscode.window, 'showInputBox', async () => 'Implement error handling');
    await vscode.commands.executeCommand('vs-codebench.addTodo');
    stub(vscode.window, 'showInputBox', async () => 'Write unit tests');
    await vscode.commands.executeCommand('vs-codebench.addTodo');

    let todos = todosProvider.getTodos();
    assert.strictEqual(todos.length, 2, 'Should have 2 todos');

    // Add sub-todo to the second
    const parent = todos[1];
    await todosProvider.addTodo('Test edge cases', parent.id);

    // Toggle done on parent and child via provider (commands need selection context)
    await todosProvider.toggleTodoDone({ todo: parent } as any);
    const child = todosProvider.getTodos().find((t: any) => t.parentId === parent.id)!;
    await todosProvider.toggleTodoDone({ todo: child } as any);

    let stats = todosProvider.getTodoStats();
    assert.strictEqual(stats.completed >= 2, true, 'At least parent and child completed');

    // Rename parent via provider
    await todosProvider.renameTodo(parent.id, 'Write unit tests (renamed)');

    // Delete child via provider
    await todosProvider.deleteTodo(child.id);

    // Verify state
    todos = todosProvider.getTodos();
    assert.ok(todos.find((t: any) => t.id === parent.id && t.text.includes('(renamed)')));
    assert.ok(!todos.find((t: any) => t.id === child.id));
  });
});

