import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('VS CodeBench command-driven workflow', () => {
  let extension: vscode.Extension<any>;
  let testFileUri: vscode.Uri;
  let workspaceFolder: string;

  const stubs: { restore: () => void }[] = [];
  const stub = <T extends object, K extends keyof T>(obj: T, key: K, impl: any) => {
    const original = (obj as any)[key];
    (obj as any)[key] = impl;
    stubs.push({ restore: () => { (obj as any)[key] = original; } });
  };

  suiteSetup(async function () {
    this.timeout(30000);

    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    if (!extension) {
      throw new Error('Extension not found');
    }

    if (!extension.isActive) {
      await extension.activate();
    }
    assert.ok(extension.isActive, 'Extension should be active');

    workspaceFolder = path.join(process.cwd(), '.test-workspace');
    if (!fs.existsSync(workspaceFolder)) {
      fs.mkdirSync(workspaceFolder, { recursive: true });
    }
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    if (fs.existsSync(workspaceFolder)) {
      fs.rmSync(workspaceFolder, { recursive: true, force: true });
    }
  });

  setup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  teardown(() => {
    while (stubs.length) {
      stubs.pop()!.restore();
    }
  });

  test('Adds bookmarks, todos, and a scratchpad through commands', async function () {
    this.timeout(20000);

    const jsFilePath = path.join(workspaceFolder, 'test-file.js');
    testFileUri = vscode.Uri.file(jsFilePath);

    const jsContent = `// Test JavaScript File
function calculateSum(a, b) {
  return a + b;
}

function calculateProduct(a, b) {
  return a * b;
}

const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((acc, num) => acc + num, 0);
console.log('Sum:', sum);

const doubled = numbers.map(n => n * 2);
console.log('Doubled:', doubled);

// Helper function
function isEven(num) {
  return num % 2 === 0;
}

const evenNumbers = numbers.filter(isEven);
console.log('Even numbers:', evenNumbers);`;

    fs.writeFileSync(jsFilePath, jsContent, 'utf8');

    const document = await vscode.workspace.openTextDocument(testFileUri);
    const editor = await vscode.window.showTextDocument(document);
    await new Promise(resolve => setTimeout(resolve, 500));

    const { bookmarksProvider, todosProvider, scratchpadsProvider } = extension.exports;
    assert.ok(bookmarksProvider, 'BookmarksProvider should be exported');
    assert.ok(todosProvider, 'TodosProvider should be exported');
    assert.ok(scratchpadsProvider, 'ScratchpadsProvider should be exported');

    for (const bookmark of [...bookmarksProvider.getAllBookmarks()]) {
      await bookmarksProvider.deleteBookmark(bookmark.id);
    }
    for (const folder of [...bookmarksProvider.getFolders()]) {
      await bookmarksProvider.deleteFolder(folder.id);
    }
    for (const todo of [...todosProvider.getTodos()]) {
      await todosProvider.deleteTodo(todo.id);
    }
    for (const file of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(file.id);
    }

    editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));
    stub(vscode.window, 'showInputBox', async () => 'Calculate sum function');
    await vscode.commands.executeCommand('vs-codebench.addBookmark');

    editor.selection = new vscode.Selection(new vscode.Position(5, 0), new vscode.Position(5, 0));
    stub(vscode.window, 'showInputBox', async () => 'Calculate product function');
    await vscode.commands.executeCommand('vs-codebench.addBookmark');

    const bookmarks = bookmarksProvider.getAllBookmarks();
    assert.strictEqual(bookmarks.length, 2, 'Should have 2 bookmarks');

    stub(vscode.window, 'showInputBox', async () => 'Math Functions');
    await vscode.commands.executeCommand('vs-codebench.addRootFolder');
    assert.strictEqual(bookmarksProvider.getFolders().length, 1, 'Should have 1 folder');

    stub(vscode.window, 'showInputBox', async () => 'Implement error handling');
    await vscode.commands.executeCommand('vs-codebench.addTodo');
    stub(vscode.window, 'showInputBox', async () => 'Write unit tests');
    await vscode.commands.executeCommand('vs-codebench.addTodo');

    const todos = todosProvider.getTodos();
    assert.strictEqual(todos.length, 2, 'Should have 2 todos');

    const rootItems = await todosProvider.getChildren();
    const parentItem = rootItems.find((item: any) => item.todo.text === 'Write unit tests');
    const firstItem = rootItems.find((item: any) => item.todo.text === 'Implement error handling');
    assert.ok(parentItem, 'Parent todo tree item should exist');
    assert.ok(firstItem, 'First todo tree item should exist');

    stub(vscode.window, 'showInputBox', async () => 'Test edge cases');
    await vscode.commands.executeCommand('vs-codebench.addSubTodo', parentItem);
    assert.strictEqual(todosProvider.getTodos().length, 3, 'Should have 3 todos total');

    await vscode.commands.executeCommand('vs-codebench.toggleTodo', firstItem);
    await vscode.commands.executeCommand('vs-codebench.toggleTodo', parentItem);

    const stats1 = todosProvider.getTodoStats();
    assert.strictEqual(stats1.completed, 2, 'Should have 2 completed todos');

    const refreshedRoots = await todosProvider.getChildren();
    const refreshedFirst = refreshedRoots.find((item: any) => item.todo.text === 'Implement error handling');
    const refreshedParent = refreshedRoots.find((item: any) => item.todo.text === 'Write unit tests');
    await vscode.commands.executeCommand('vs-codebench.toggleTodo', refreshedFirst);
    await vscode.commands.executeCommand('vs-codebench.toggleTodo', refreshedParent);

    const stats2 = todosProvider.getTodoStats();
    assert.strictEqual(stats2.completed, 0, 'Should have 0 completed todos');

    stub(vscode.window, 'showQuickPick', async () => ({ label: 'Markdown', extension: '.md' }));
    await vscode.commands.executeCommand('vs-codebench.createScratchpad');

    const scratchFiles = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(scratchFiles.length, 1, 'Should have 1 scratchpad');
    assert.ok(scratchFiles[0].name.endsWith('.md'), 'Scratchpad should use the selected markdown type');
  });
});
