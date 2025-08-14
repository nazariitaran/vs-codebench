import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Cleanup commands: clear checked/all todos and all bookmarks', () => {
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

  test('Todos: Remove checked via command and Clear All via command', async function () {
    this.timeout(20000);
    const { todosProvider } = extension.exports as any;
    assert.ok(todosProvider, 'todosProvider should be available');

    // Ensure clean state
    for (const t of [...todosProvider.getTodos()]) {
      await todosProvider.deleteTodo(t.id);
    }

    // Add three todos
    await todosProvider.addTodo('A');
    await todosProvider.addTodo('B');
    await todosProvider.addTodo('C');

    // Mark A and C as done
    const todosInitial = todosProvider.getTodos();
    const a = todosInitial.find((t: any) => t.text === 'A')!;
    const b = todosInitial.find((t: any) => t.text === 'B')!;
    const c = todosInitial.find((t: any) => t.text === 'C')!;
    await todosProvider.toggleTodoDone({ todo: a } as any);
    await todosProvider.toggleTodoDone({ todo: c } as any);

    // Confirm removal of checked
    stub(vscode.window, 'showWarningMessage', async () => 'Remove');
    await vscode.commands.executeCommand('vs-codebench.clearCheckedTodos');

    let remaining = todosProvider.getTodos();
    assert.strictEqual(remaining.length, 1, 'Only one todo should remain');
    assert.strictEqual(remaining[0].id, b.id, 'Un-checked todo should remain');

    // Now clear all
    stub(vscode.window, 'showWarningMessage', async () => 'Clear All');
    await vscode.commands.executeCommand('vs-codebench.clearAllTodos');
    remaining = todosProvider.getTodos();
    assert.strictEqual(remaining.length, 0, 'All todos should be cleared');
  });

  test('Bookmarks: Clear All via command clears bookmarks and folders', async function () {
    this.timeout(25000);
    const { bookmarksProvider } = extension.exports as any;
    assert.ok(bookmarksProvider, 'bookmarksProvider should be available');

    // Prepare a temporary file in a temp workspace folder
    const workspaceFolder = path.join(process.cwd(), '.test-workspace-cleanup');
    if (!fs.existsSync(workspaceFolder)) {
      fs.mkdirSync(workspaceFolder, { recursive: true });
    }
    const jsFilePath = path.join(workspaceFolder, 'sample2.js');
    fs.writeFileSync(jsFilePath, ['function x() { return 1; }', 'function y() { return 2; }'].join('\n'), 'utf8');
    const testFileUri = vscode.Uri.file(jsFilePath);

    const document = await vscode.workspace.openTextDocument(testFileUri);
    await vscode.window.showTextDocument(document);

    // Ensure clean state
    for (const b of [...bookmarksProvider.getAllBookmarks()]) {
      await bookmarksProvider.deleteBookmark(b.id);
    }
    for (const f of [...bookmarksProvider.bookmarkService.getFolders()]) {
      await bookmarksProvider.bookmarkService.deleteFolder(f.id);
    }

    // Add two bookmarks via command (stub input text)
    stub(vscode.window, 'showInputBox', async () => 'Bookmark X');
    await vscode.commands.executeCommand('vs-codebench.addBookmark');

    const editor = vscode.window.activeTextEditor!;
    editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));
    stub(vscode.window, 'showInputBox', async () => 'Bookmark Y');
    await vscode.commands.executeCommand('vs-codebench.addBookmark');

    // Add a folder
    stub(vscode.window, 'showInputBox', async () => 'Folder1');
    await vscode.commands.executeCommand('vs-codebench.addRootFolder');

    let all = bookmarksProvider.getAllBookmarks();
    let folders = bookmarksProvider.bookmarkService.getFolders();
    assert.strictEqual(all.length, 2, 'Should have 2 bookmarks before clear all');
    assert.strictEqual(folders.length, 1, 'Should have 1 folder before clear all');

    // Clear all with confirmation
    stub(vscode.window, 'showWarningMessage', async () => 'Clear All');
    await vscode.commands.executeCommand('vs-codebench.clearAllBookmarks');

    all = bookmarksProvider.getAllBookmarks();
    folders = bookmarksProvider.bookmarkService.getFolders();
    assert.strictEqual(all.length, 0, 'All bookmarks should be cleared');
    assert.strictEqual(folders.length, 0, 'All folders should be cleared');

    // Cleanup editors
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    if (fs.existsSync(workspaceFolder)) {
      fs.rmSync(workspaceFolder, { recursive: true, force: true });
    }
  });
  test('Scratchpads: Clear All via command removes all scratchpad files and metadata', async function () {
    this.timeout(25000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    // Ensure clean state
    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }

    // Create two scratchpads directly via service for speed
    await scratchpadsProvider.scratchpadService.createScratchFile('scratchpad_1.txt', 'plaintext');
    await scratchpadsProvider.scratchpadService.createScratchFile('scratchpad_2.txt', 'plaintext');

    let files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(files.length, 2, 'Should have 2 scratchpads before clear all');

    // Stub confirm and clear all via command
    stub(vscode.window, 'showWarningMessage', async () => 'Clear All');
    await vscode.commands.executeCommand('vs-codebench.clearAllScratchpads');

    files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(files.length, 0, 'All scratchpads should be cleared');
  });
});

