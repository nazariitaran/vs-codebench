import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Bookmarks: drag-and-drop', () => {
  let extension: vscode.Extension<any>;
  let workspaceFolder: string;
  let testFileUri: vscode.Uri;

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    if (!extension.isActive) {
      await extension.activate();
    }

    workspaceFolder = path.join(process.cwd(), '.test-workspace-bookmarks-dnd');
    if (!fs.existsSync(workspaceFolder)) {
      fs.mkdirSync(workspaceFolder, { recursive: true });
    }

    const jsFilePath = path.join(workspaceFolder, 'dnd.js');
    fs.writeFileSync(jsFilePath, ['function a() {}', 'function b() {}', 'function c() {}'].join('\n'), 'utf8');
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

  test('reorder within same container and move to/from folder', async function () {
    this.timeout(20000);
    const { bookmarksProvider } = extension.exports as any;

    // Clean state
    for (const b of [...bookmarksProvider.getAllBookmarks()]) {
      await bookmarksProvider.deleteBookmark(b.id);
    }
    for (const f of [...bookmarksProvider.bookmarkService.getFolders()]) {
      await bookmarksProvider.bookmarkService.deleteFolder(f.id);
    }

    // Create three bookmarks
    await bookmarksProvider.addBookmark(testFileUri.toString(), 0, 'A');
    await bookmarksProvider.addBookmark(testFileUri.toString(), 1, 'B');
    await bookmarksProvider.addBookmark(testFileUri.toString(), 2, 'C');

    let list = bookmarksProvider.getAllBookmarks();
    const a = list.find((x: any) => x.text === 'A')!;
    const b = list.find((x: any) => x.text === 'B')!;
    const c = list.find((x: any) => x.text === 'C')!;

    // Reorder: move C before B
    await bookmarksProvider.reorderItems(c.id, b.id, 'before');

    list = bookmarksProvider.getAllBookmarks().filter((x: any) => !x.parentId).sort((m: any, n: any) => m.order - n.order);
    assert.deepStrictEqual(list.map((x: any) => x.text), ['A', 'C', 'B']);

    // Create folder and move A, then back to root
    const folder = await bookmarksProvider.bookmarkService.addFolder('Folder1');
    await bookmarksProvider.moveToFolder(a.id, folder.id);
    let inFolder = bookmarksProvider.getAllBookmarks().filter((x: any) => x.parentId === folder.id);
    assert.strictEqual(inFolder.length, 1);

    // Move back to root
    await bookmarksProvider.moveToFolder(a.id, undefined);
    inFolder = bookmarksProvider.getAllBookmarks().filter((x: any) => x.parentId === folder.id);
    assert.strictEqual(inFolder.length, 0);
  });
});

