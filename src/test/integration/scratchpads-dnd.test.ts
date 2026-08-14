import * as assert from 'assert';
import * as vscode from 'vscode';
import { ScratchpadDragAndDropController } from '../../features/scratchpads/views/ScratchpadDragAndDropController';
import { ScratchpadItem } from '../../features/scratchpads/views/ScratchpadItem';

suite('Scratchpads: drag-and-drop controller', () => {
  let extension: vscode.Extension<any>;

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    if (!extension.isActive) {
      await extension.activate();
    }
  });

  test('handleDrop reorders onto a file and moves a file to root', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }
    for (const folder of [...scratchpadsProvider.scratchpadService.getFolders()]) {
      await scratchpadsProvider.deleteFolderForTools(folder.id);
    }

    const a = await scratchpadsProvider.scratchpadService.createScratchFile('a.txt', 'plaintext');
    const b = await scratchpadsProvider.scratchpadService.createScratchFile('b.txt', 'plaintext');
    const c = await scratchpadsProvider.scratchpadService.createScratchFile('c.txt', 'plaintext');

    let list = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.deepStrictEqual(list.map((x: any) => x.name), ['a.txt', 'b.txt', 'c.txt']);
    let uiItems = await scratchpadsProvider.getChildren();
    assert.deepStrictEqual(uiItems.map((i: any) => i.label), ['a.txt', 'b.txt', 'c.txt']);

    const controller = new ScratchpadDragAndDropController(scratchpadsProvider);
    const token = new vscode.CancellationTokenSource().token;

    const reorderTransfer = new vscode.DataTransfer();
    await controller.handleDrag([new ScratchpadItem(c)], reorderTransfer, token);
    await controller.handleDrop(new ScratchpadItem(b), reorderTransfer, token);

    list = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.deepStrictEqual(list.map((x: any) => x.name), ['a.txt', 'c.txt', 'b.txt']);
    uiItems = await scratchpadsProvider.getChildren();
    assert.deepStrictEqual(uiItems.map((i: any) => i.label), ['a.txt', 'c.txt', 'b.txt']);

    const rootTransfer = new vscode.DataTransfer();
    await controller.handleDrag([new ScratchpadItem(a)], rootTransfer, token);
    await controller.handleDrop(undefined, rootTransfer, token);

    list = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.deepStrictEqual(list.map((x: any) => x.name), ['c.txt', 'b.txt', 'a.txt']);
    uiItems = await scratchpadsProvider.getChildren();
    assert.deepStrictEqual(uiItems.map((i: any) => i.label), ['c.txt', 'b.txt', 'a.txt']);
  });
});
