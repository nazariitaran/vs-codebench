import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BookmarkDragAndDropController } from '../../features/bookmarks/views/BookmarkDragAndDropController';
import { BookmarkTreeItem } from '../../features/bookmarks/views/BookmarkTreeItem';
import { BookmarkFolderTreeItem } from '../../features/bookmarks/views/BookmarkFolderTreeItem';

suite('Bookmarks: drag-and-drop controller', () => {
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

  test('handleDrop reorders onto a bookmark and moves to/from a folder', async function () {
    this.timeout(20000);
    const { bookmarksProvider } = extension.exports as any;

    for (const b of [...bookmarksProvider.getAllBookmarks()]) {
      await bookmarksProvider.deleteBookmark(b.id);
    }
    for (const f of [...bookmarksProvider.getFolders()]) {
      await bookmarksProvider.deleteFolder(f.id);
    }

    await bookmarksProvider.addBookmark(testFileUri.toString(), 0, 'A');
    await bookmarksProvider.addBookmark(testFileUri.toString(), 1, 'B');
    await bookmarksProvider.addBookmark(testFileUri.toString(), 2, 'C');

    let list = bookmarksProvider.getAllBookmarks();
    const a = list.find((x: any) => x.text === 'A')!;
    const b = list.find((x: any) => x.text === 'B')!;
    const c = list.find((x: any) => x.text === 'C')!;

    const controller = new BookmarkDragAndDropController(bookmarksProvider);
    const token = new vscode.CancellationTokenSource().token;

    const draggedC = new BookmarkTreeItem('C');
    draggedC.id = c.id;
    const targetB = new BookmarkTreeItem('B');
    targetB.id = b.id;

    const reorderTransfer = new vscode.DataTransfer();
    await controller.handleDrag([draggedC], reorderTransfer, token);
    await controller.handleDrop(targetB, reorderTransfer, token);

    list = bookmarksProvider.getAllBookmarks().filter((x: any) => !x.parentId).sort((m: any, n: any) => m.order - n.order);
    assert.deepStrictEqual(list.map((x: any) => x.text), ['A', 'C', 'B']);

    await bookmarksProvider.addFolder('Folder1');
    const folder = bookmarksProvider.getFolders().find((f: any) => f.name === 'Folder1')!;
    const folderItem = new BookmarkFolderTreeItem(folder.name, folder.id);

    const draggedA = new BookmarkTreeItem('A');
    draggedA.id = a.id;
    const moveTransfer = new vscode.DataTransfer();
    await controller.handleDrag([draggedA], moveTransfer, token);
    await controller.handleDrop(folderItem, moveTransfer, token);

    let inFolder = bookmarksProvider.getAllBookmarks().filter((x: any) => x.parentId === folder.id);
    assert.strictEqual(inFolder.length, 1);

    const rootTransfer = new vscode.DataTransfer();
    await controller.handleDrag([draggedA], rootTransfer, token);
    await controller.handleDrop(undefined, rootTransfer, token);

    inFolder = bookmarksProvider.getAllBookmarks().filter((x: any) => x.parentId === folder.id);
    assert.strictEqual(inFolder.length, 0);
  });
});
