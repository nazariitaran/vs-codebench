import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Scratchpads: command-driven flows', () => {
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

  test('Create, rename, open, delete scratchpad via commands', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    // Clean existing scratchpads
    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }

    // Create scratchpad via command with stubbed inputs
    stub(vscode.window, 'showInputBox', async () => 'notes.md');
    // If language is requested via quick pick, return 'markdown'
    stub(vscode.window, 'showQuickPick', async () => ({ label: 'markdown' } as any));

    await vscode.commands.executeCommand('vs-codebench.createScratchpad');

    let files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(files.length >= 1, true, 'At least one scratchpad should exist');
    const file = files[0];

    // Rename directly via service to avoid UI prompts and collisions
    const uniqueName = `${file.name}.renamed`;
    await scratchpadsProvider.scratchpadService.renameScratchFile(file.id, uniqueName);

    const renamed = scratchpadsProvider.scratchpadService.getScratchFile(file.id)!;
    assert.strictEqual(renamed.name, uniqueName);

    // Open scratch file via provider API
    await scratchpadsProvider.openScratchFile(renamed.id);

    // Delete directly via service to avoid modal confirm
    await scratchpadsProvider.scratchpadService.deleteScratchFile(renamed.id);
    files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.ok(!files.find((f: any) => f.id === renamed.id), 'Scratchpad should be deleted');
  });

  test('Saves active untitled markdown editor as scratchpad with .md extension', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }

    const content = '# quick note\n\nconsole.log(1);';
    const untitledDoc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content
    });
    await vscode.window.showTextDocument(untitledDoc, { preview: false, preserveFocus: false });

    await vscode.commands.executeCommand('vs-codebench.saveUnsavedAsScratchpad');

    const files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(files.length, 1, 'One scratchpad should be created');
    assert.strictEqual(files[0].name.endsWith('.md'), true, 'Scratchpad should use .md extension');
    assert.strictEqual(files[0].name.startsWith('scratchpad_'), true, 'Scratchpad should keep naming convention');
    assert.strictEqual(files[0].content, content, 'Scratchpad should preserve untitled editor content');

    const hasUntitledTab = vscode.window.tabGroups.all
      .flatMap(group => group.tabs)
      .some(tab => {
        const input = tab.input as { uri?: vscode.Uri };
        return input.uri?.toString() === untitledDoc.uri.toString();
      });
    assert.strictEqual(hasUntitledTab, false, 'Untitled source editor should be closed after save');
  });

  test('Falls back to .txt when language has no mapping', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }

    const content = 'temp data';
    const untitledDoc = await vscode.workspace.openTextDocument({
      language: 'mermaid',
      content
    });
    await vscode.window.showTextDocument(untitledDoc, { preview: false, preserveFocus: false });

    await vscode.commands.executeCommand('vs-codebench.saveUnsavedAsScratchpad');

    const files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(files.length, 1, 'One scratchpad should be created');
    assert.strictEqual(files[0].name.endsWith('.txt'), true, 'Unknown language should fall back to .txt');
    assert.strictEqual(files[0].content, content, 'Scratchpad should preserve untitled editor content');
  });

  test('Delete scratchpad folder asks for confirmation and deletes subtree on confirm', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }
    for (const folder of [...scratchpadsProvider.scratchpadService.getFolders()]) {
      await scratchpadsProvider.deleteFolderForTools(folder.id);
    }

    const rootFolder = await scratchpadsProvider.addFolder('Root Folder');
    const childFolder = await scratchpadsProvider.addFolder('Child Folder', rootFolder.id);
    const rootFile = await scratchpadsProvider.scratchpadService.createScratchFile('root.md');
    const childFile = await scratchpadsProvider.scratchpadService.createScratchFile('child.md');

    await scratchpadsProvider.scratchpadService.moveToFolder(rootFile.id, rootFolder.id);
    await scratchpadsProvider.scratchpadService.moveToFolder(childFile.id, childFolder.id);

    let warningMessage: string | undefined;
    stub(vscode.window, 'showWarningMessage', async (message: string) => {
      warningMessage = message;
      return 'Delete';
    });

    await vscode.commands.executeCommand('vs-codebench.deleteScratchpadFolder', { id: rootFolder.id });

    assert.strictEqual(
      warningMessage,
      'Are you sure you want to delete "Root Folder"? This will delete 3 item(s) including all subfolders and scratchpads.'
    );
    assert.strictEqual(scratchpadsProvider.scratchpadService.getFolderById(rootFolder.id), undefined);
    assert.strictEqual(scratchpadsProvider.scratchpadService.getFolderById(childFolder.id), undefined);
    assert.strictEqual(scratchpadsProvider.scratchpadService.getScratchFile(rootFile.id), undefined);
    assert.strictEqual(scratchpadsProvider.scratchpadService.getScratchFile(childFile.id), undefined);
  });

  test('Delete scratchpad folder keeps subtree when confirmation is cancelled', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }
    for (const folder of [...scratchpadsProvider.scratchpadService.getFolders()]) {
      await scratchpadsProvider.deleteFolderForTools(folder.id);
    }

    const folder = await scratchpadsProvider.addFolder('Keep Folder');
    const file = await scratchpadsProvider.scratchpadService.createScratchFile('keep.md');
    await scratchpadsProvider.scratchpadService.moveToFolder(file.id, folder.id);

    stub(vscode.window, 'showWarningMessage', async () => undefined);

    await vscode.commands.executeCommand('vs-codebench.deleteScratchpadFolder', { id: folder.id });

    assert.ok(scratchpadsProvider.scratchpadService.getFolderById(folder.id), 'Folder should remain after cancel');
    assert.ok(scratchpadsProvider.scratchpadService.getScratchFile(file.id), 'Contained file should remain after cancel');
  });
});

