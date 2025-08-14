import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Bookmarks: file rename and deletion handling', () => {
  let extension: vscode.Extension<any>;
  let workspaceFolder: string;

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    assert.ok(extension, 'Extension should be found');
    if (!extension.isActive) {
      await extension.activate();
    }
    assert.ok(extension.isActive, 'Extension should be active');

    workspaceFolder = path.join(process.cwd(), '.test-workspace-bookmarks-events');
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
    const { bookmarksProvider } = extension.exports as any;
    // Clean existing bookmarks and folders to avoid cross-test interference
    for (const b of [...bookmarksProvider.getAllBookmarks()]) {
      await bookmarksProvider.deleteBookmark(b.id);
    }
    for (const f of [...bookmarksProvider.bookmarkService.getFolders()]) {
      await bookmarksProvider.bookmarkService.deleteFolder(f.id);
    }
  });

  test('renaming a file updates associated bookmarks fileUri', async function () {
    this.timeout(20000);
    const { bookmarksProvider } = extension.exports as any;

    // Create a file with a couple of lines
    const oldPath = path.join(workspaceFolder, 'a.js');
    fs.writeFileSync(oldPath, ['console.log(1);', 'console.log(2);'].join('\n'), 'utf8');
    const oldUri = vscode.Uri.file(oldPath);

    // Open once to ensure VS Code has a handle on it
    const doc = await vscode.workspace.openTextDocument(oldUri);
    await vscode.window.showTextDocument(doc);

    // Add a bookmark at line 0
    await bookmarksProvider.addBookmark(oldUri.toString(), 0, 'First line');

    // Sanity
    let bookmarks = bookmarksProvider.getBookmarksForFile(oldUri.toString());
    assert.strictEqual(bookmarks.length, 1, 'Should have 1 bookmark on original file');

    // Rename the file on disk
    const newPath = path.join(workspaceFolder, 'a-renamed.js');
    const newUri = vscode.Uri.file(newPath);
    fs.renameSync(oldPath, newPath);

    // Notify the service (simulate VS Code onDidRenameFiles)
    const modified = await bookmarksProvider.bookmarkService.handleFileRenamed([
      { oldUri, newUri }
    ]);
    assert.ok(modified, 'Service should report modifications on rename');

    // Assertions: bookmarks should now reference the new URI
    bookmarks = bookmarksProvider.getBookmarksForFile(oldUri.toString());
    assert.strictEqual(bookmarks.length, 0, 'Old URI should have no bookmarks');

    const updated = bookmarksProvider.getBookmarksForFile(newUri.toString());
    assert.strictEqual(updated.length, 1, 'New URI should have 1 bookmark');
    assert.strictEqual(updated[0].line, 0, 'Line number should be preserved');

    // Try opening the renamed file and ensure jump still works
    const opened = await vscode.workspace.openTextDocument(newUri);
    await vscode.window.showTextDocument(opened);
    await bookmarksProvider.jumpToBookmark(updated[0]);
  });

  test('deleting a file removes associated bookmarks', async function () {
    this.timeout(20000);
    const { bookmarksProvider } = extension.exports as any;

    // Create a file with a couple of lines
    const filePath = path.join(workspaceFolder, 'b.js');
    fs.writeFileSync(filePath, ['const x = 1;', 'const y = 2;'].join('\n'), 'utf8');
    const uri = vscode.Uri.file(filePath);

    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    // Add two bookmarks
    await bookmarksProvider.addBookmark(uri.toString(), 0, 'X decl');
    await bookmarksProvider.addBookmark(uri.toString(), 1, 'Y decl');

    // Sanity
    let bookmarks = bookmarksProvider.getBookmarksForFile(uri.toString());
    assert.strictEqual(bookmarks.length, 2, 'Should have 2 bookmarks before deletion');

    // Delete file on disk
    fs.unlinkSync(filePath);

    // Notify the service (simulate VS Code onDidDeleteFiles)
    const modified = await bookmarksProvider.bookmarkService.handleFileDeleted([uri]);
    assert.ok(modified, 'Service should report modifications on deletion');

    // Assert bookmarks removed
    bookmarks = bookmarksProvider.getBookmarksForFile(uri.toString());
    assert.strictEqual(bookmarks.length, 0, 'All bookmarks for deleted file should be removed');
  });
});

