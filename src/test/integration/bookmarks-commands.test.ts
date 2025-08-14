import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Bookmarks: command-driven flows', () => {
  let extension: vscode.Extension<any>;
  let workspaceFolder: string;
  let testFileUri: vscode.Uri;

  const stubs: { restore: () => void }[] = [];
  const stub = <T extends object, K extends keyof T>(obj: T, key: K, impl: any) => {
    const original = (obj as any)[key];
    (obj as any)[key] = impl;
    stubs.push({ restore: () => { (obj as any)[key] = original; } });
  };

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    assert.ok(extension, 'Extension should be found');
    if (!extension.isActive) {
      await extension.activate();
    }
    assert.ok(extension.isActive, 'Extension should be active');

    workspaceFolder = path.join(process.cwd(), '.test-workspace-bookmarks');
    if (!fs.existsSync(workspaceFolder)) {
      fs.mkdirSync(workspaceFolder, { recursive: true });
    }

    const jsFilePath = path.join(workspaceFolder, 'sample.js');
    fs.writeFileSync(jsFilePath, ['function a() { return 1; }', 'function b() { return 2; }'].join('\n'), 'utf8');
    testFileUri = vscode.Uri.file(jsFilePath);

    const document = await vscode.workspace.openTextDocument(testFileUri);
    await vscode.window.showTextDocument(document);
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    if (fs.existsSync(workspaceFolder)) {
      fs.rmSync(workspaceFolder, { recursive: true, force: true });
    }
  });

  teardown(() => {
    // restore stubs between tests
    while (stubs.length) {
      stubs.pop()!.restore();
    }
  });

  test('Add, folderize, rename, and delete bookmarks via commands/providers', async function () {
    this.timeout(20000);
    const { bookmarksProvider } = extension.exports as any;
    assert.ok(bookmarksProvider, 'bookmarksProvider should be available');

    // Clean existing bookmarks and folders to avoid cross-test interference
    for (const b of [...bookmarksProvider.getAllBookmarks()]) {
      await bookmarksProvider.deleteBookmark(b.id);
    }
    for (const f of [...bookmarksProvider.bookmarkService.getFolders()]) {
      await bookmarksProvider.bookmarkService.deleteFolder(f.id);
    }

    // Add two bookmarks via commands (stub input text)
    stub(vscode.window, 'showInputBox', async () => 'Calculate sum');
    await vscode.commands.executeCommand('vs-codebench.addBookmark');

    // Move cursor to line 2, then add another
    const editor = vscode.window.activeTextEditor!;
    editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));
    stub(vscode.window, 'showInputBox', async () => 'Calculate product');
    await vscode.commands.executeCommand('vs-codebench.addBookmark');

    let bookmarks = bookmarksProvider.getAllBookmarks();
    assert.strictEqual(bookmarks.length, 2, 'Should have two bookmarks');

    // Create folder via command
    stub(vscode.window, 'showInputBox', async () => 'Math Functions');
    await vscode.commands.executeCommand('vs-codebench.addRootFolder');
    const folders = bookmarksProvider.bookmarkService.getFolders();
    assert.strictEqual(folders.length, 1, 'Should have 1 folder');

    // Move bookmarks to the folder via provider API (no UI dependency)
    await bookmarksProvider.moveToFolder(bookmarks[0].id, folders[0].id);
    await bookmarksProvider.moveToFolder(bookmarks[1].id, folders[0].id);

    // Rename first bookmark via command (requires selected element in real UI), so use provider API to simulate
    const first = bookmarksProvider.bookmarkService.getBookmarkById(bookmarks[0].id)!;
    await bookmarksProvider.bookmarkService.editBookmark(first.id, 'Sum function');

    // Verify state
    bookmarks = bookmarksProvider.getAllBookmarks();
    const renamed = bookmarks.find((b: any) => b.id === first.id)!;
    assert.strictEqual(renamed.text, 'Sum function');

    // Delete second bookmark using provider (command usually needs selection)
    await bookmarksProvider.deleteBookmark(bookmarks[1].id);
    bookmarks = bookmarksProvider.getAllBookmarks();
    assert.strictEqual(bookmarks.length, 1, 'Should have one bookmark after deletion');

    // Ensure folder still present
    const foldersAfter = bookmarksProvider.bookmarkService.getFolders();
    assert.strictEqual(foldersAfter.length, 1);
  });
});

