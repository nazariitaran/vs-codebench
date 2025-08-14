import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Scratchpads: drag-and-drop (provider API)', () => {
  let extension: vscode.Extension<any>;

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    if (!extension.isActive) {
      await extension.activate();
    }
  });

  test('reorder items and drop to end', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    // Clean existing scratchpads
    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }

    // Create three scratchpads directly via service to avoid UI
    const a = await scratchpadsProvider.scratchpadService.createScratchFile('a.txt', 'plaintext');
    const b = await scratchpadsProvider.scratchpadService.createScratchFile('b.txt', 'plaintext');
    const c = await scratchpadsProvider.scratchpadService.createScratchFile('c.txt', 'plaintext');

    // Sanity - service ordering
    let list = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.deepStrictEqual(list.map((x: any) => x.name), ['a.txt', 'b.txt', 'c.txt']);
    // Sanity - what the view would render
    let uiItems = await scratchpadsProvider.getChildren();
    assert.deepStrictEqual(uiItems.map((i: any) => i.label), ['a.txt', 'b.txt', 'c.txt']);

    // Reorder: move C before B
    await scratchpadsProvider.reorderScratchpad(c.id, b.id);
    list = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.deepStrictEqual(list.map((x: any) => x.name), ['a.txt', 'c.txt', 'b.txt']);
    uiItems = await scratchpadsProvider.getChildren();
    assert.deepStrictEqual(uiItems.map((i: any) => i.label), ['a.txt', 'c.txt', 'b.txt']);

    // Drop A to the end (simulate drop on empty space)
    await scratchpadsProvider.reorderScratchpad(a.id, undefined);
    list = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.deepStrictEqual(list.map((x: any) => x.name), ['c.txt', 'b.txt', 'a.txt']);
    uiItems = await scratchpadsProvider.getChildren();
    assert.deepStrictEqual(uiItems.map((i: any) => i.label), ['c.txt', 'b.txt', 'a.txt']);
  });
});


