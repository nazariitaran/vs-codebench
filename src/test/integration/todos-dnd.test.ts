import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Todos: drag-and-drop', () => {
  let extension: vscode.Extension<any>;

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    if (!extension.isActive) {
      await extension.activate();
    }
  });

  test('reorder siblings and change parent via provider APIs', async function () {
    this.timeout(20000);
    const { todosProvider } = extension.exports as any;

    // Clean existing todos
    for (const t of [...todosProvider.getTodos()]) {
      await todosProvider.deleteTodo(t.id);
    }

    // Create structure: A, B, C; and B1 as child of B
    await todosProvider.addTodo('A');
    await todosProvider.addTodo('B');
    await todosProvider.addTodo('C');
    const root = todosProvider.getTodos().filter((t: any) => !t.parentId);
    const A = root.find((t: any) => t.text === 'A');
    const B = root.find((t: any) => t.text === 'B');
    const C = root.find((t: any) => t.text === 'C');

    await todosProvider.addTodo('B1', B.id);

    // Reorder: move C before B
    await todosProvider.reorderTodo(C.id, B.id);
    const orderAfter = todosProvider.getTodos().filter((t: any) => !t.parentId).map((t: any) => t.text);
    assert.deepStrictEqual(orderAfter, ['A', 'C', 'B']);

    // Change parent: move A under B
    const AItem = { todo: A } as any;
    const BItem = { todo: B } as any;
    // Simulate by directly setting parent via service method
    await todosProvider.addTodo('temp', A.id); // ensure A has children boundary ok (create dummy then delete)
    const childTemp = todosProvider.getTodos().find((t: any) => t.parentId === A.id);
    await todosProvider.deleteTodo(childTemp.id);
    // We don't have an explicit "make child" API; emulate by deleting and re-adding under B
    await todosProvider.deleteTodo(A.id);
    await todosProvider.addTodo('A', B.id);

    const childrenOfB = todosProvider.getTodos().filter((t: any) => t.parentId === B.id).map((t: any) => t.text);
    assert.ok(childrenOfB.includes('A'));

    // Move B1 to root by delete+readd
    const B1 = todosProvider.getTodos().find((t: any) => t.text === 'B1');
    await todosProvider.deleteTodo(B1.id);
    await todosProvider.addTodo('B1');

    const roots = todosProvider.getTodos().filter((t: any) => !t.parentId).map((t: any) => t.text);
    assert.ok(roots.includes('B1'));
  });
});

