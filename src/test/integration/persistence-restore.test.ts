import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Persistence and restore across lifecycle', () => {
  let extension: vscode.Extension<any>;
  let workspaceFolder: string;

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    if (!extension.isActive) {
      await extension.activate();
    }

    workspaceFolder = path.join(process.cwd(), '.test-workspace-persist');
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

  test('Data persists after provider disposal and re-instantiation', async function () {
    this.timeout(20000);

    const { todosProvider, bookmarksProvider, scratchpadsProvider } = extension.exports as any;

    // Seed data
    const filePath = path.join(workspaceFolder, 'persist.js');
    fs.writeFileSync(filePath, 'console.log("hi")', 'utf8');
    const fileUri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    await bookmarksProvider.addBookmark(fileUri.toString(), 1, 'Bookmark 1');
    await bookmarksProvider.addFolder('Folder A');
    const folders = bookmarksProvider.bookmarkService.getFolders();
    await bookmarksProvider.moveToFolder(bookmarksProvider.getAllBookmarks()[0].id, folders[0].id);

    await todosProvider.addTodo('Persist me');
    const todo = (todosProvider.getTodos()[0]);
    await todosProvider.addTodo('Child', todo.id);

    await scratchpadsProvider.scratchpadService.createScratchFile('persist.md', 'markdown');

    // Dispose providers (simulate deactivation cleanup)
    todosProvider.dispose();
    bookmarksProvider.dispose();
    scratchpadsProvider.dispose();

    // Recreate providers with the same VS Code extension context from extension.exports
    const { todosProvider: tp2, bookmarksProvider: bp2, scratchpadsProvider: sp2 } = (await (vscode.extensions.getExtension('nazariitaran.vs-codebench')!.activate())) as any;

    // Verify restored state (at least the seeded entities exist)
    const bms = bp2.getAllBookmarks();
    assert.ok(bms.find((b: any) => b.text === 'Bookmark 1'));
    const fls2 = bp2.bookmarkService.getFolders();
    assert.ok(fls2.find((f: any) => f.name === 'Folder A'));

    const tds2 = tp2.getTodos();
    assert.ok(tds2.find((t: any) => t.text === 'Persist me'));
    const childOfSeed = tds2.find((t: any) => t.text === 'Child' && !!t.parentId);
    assert.ok(childOfSeed, 'A child todo should be present');

    const sfiles2 = sp2.scratchpadService.getScratchFiles();
    assert.ok(sfiles2.find((f: any) => f.name === 'persist.md'));
  });
});

