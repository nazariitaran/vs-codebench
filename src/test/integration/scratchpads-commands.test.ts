import * as assert from 'assert';
import * as vscode from 'vscode';
import { tabInputUri } from '../../features/scratchpads/tabUtils';

async function createUntitledEditorWithContent(content: string, language: string): Promise<vscode.TextDocument> {
  await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');

  let editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'New untitled editor should be active');
  assert.strictEqual(editor.document.uri.scheme, 'untitled');

  if (editor.document.languageId !== language) {
    const languageDoc = await vscode.languages.setTextDocumentLanguage(editor.document, language);
    editor = await vscode.window.showTextDocument(languageDoc, { preview: false, preserveFocus: false });
  }

  await vscode.commands.executeCommand('type', { text: content });

  assert.ok(
    editor.document.getText().includes(content),
    'Untitled editor should contain the typed content'
  );
  assert.ok(editor.document.isDirty, 'Untitled editor should be dirty after typing');
  return editor.document;
}

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
    stub(vscode.window, 'showQuickPick', async () => ({ label: 'Markdown', extension: '.md' } as any));

    await vscode.commands.executeCommand('vs-codebench.createScratchpad');

    let files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(files.length, 1, 'One scratchpad should exist');
    const file = files[0];

    const uniqueName = `${file.name}.renamed`;
    stub(vscode.window, 'showInputBox', async () => uniqueName);
    await vscode.commands.executeCommand('vs-codebench.renameScratchFile', { scratchFile: file });

    const renamed = scratchpadsProvider.scratchpadService.getScratchFile(file.id)!;
    assert.strictEqual(renamed.name, uniqueName);

    await vscode.commands.executeCommand('vs-codebench.openScratchFile', renamed.id);

    const scratchpadDoc = vscode.window.activeTextEditor?.document;
    assert.ok(scratchpadDoc, 'Scratchpad document should be opened');
    assert.strictEqual(scratchpadDoc?.uri.scheme, 'codebench-scratchpad');

    stub(vscode.window, 'showWarningMessage', async () => 'Delete');
    await vscode.commands.executeCommand('vs-codebench.deleteScratchFile', { scratchFile: renamed });
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
    const untitledDoc = await createUntitledEditorWithContent(content, 'markdown');
    const expectedContent = untitledDoc.getText();

    await vscode.commands.executeCommand('vs-codebench.saveUnsavedAsScratchpad');

    const files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(files.length, 1, 'One scratchpad should be created');
    assert.strictEqual(files[0].name.endsWith('.md'), true, 'Scratchpad should use .md extension');
    assert.strictEqual(files[0].name.startsWith('scratchpad_'), true, 'Scratchpad should keep naming convention');
    assert.strictEqual(
      scratchpadsProvider.scratchpadService.loadFileContent(files[0].id),
      expectedContent,
      'Scratchpad should preserve untitled editor content'
    );

    const hasUntitledTab = vscode.window.tabGroups.all
      .flatMap(group => group.tabs)
      .some(tab => tabInputUri(tab.input)?.toString() === untitledDoc.uri.toString());
    assert.strictEqual(hasUntitledTab, false, 'Untitled source editor should be closed after save');
    assert.strictEqual(untitledDoc.isClosed, true, 'Untitled document should be closed without a save prompt');

    const activeDoc = vscode.window.activeTextEditor?.document;
    assert.ok(activeDoc, 'Scratchpad should be opened automatically');
    assert.strictEqual(activeDoc?.uri.scheme, 'codebench-scratchpad');
    assert.strictEqual(activeDoc?.getText(), expectedContent, 'Opened scratchpad should show the original untitled content');
  });

  test('Falls back to .txt when language has no mapping', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }

    const content = 'temp data';
    const untitledDoc = await createUntitledEditorWithContent(content, 'lua');
    const expectedContent = untitledDoc.getText();

    await vscode.commands.executeCommand('vs-codebench.saveUnsavedAsScratchpad');

    const files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(files.length, 1, 'One scratchpad should be created');
    assert.strictEqual(files[0].name.endsWith('.txt'), true, 'Unknown language should fall back to .txt');
    assert.strictEqual(
      scratchpadsProvider.scratchpadService.loadFileContent(files[0].id),
      expectedContent,
      'Scratchpad should preserve untitled editor content'
    );

    const hasUntitledTab = vscode.window.tabGroups.all
      .flatMap(group => group.tabs)
      .some(tab => tabInputUri(tab.input)?.toString() === untitledDoc.uri.toString());
    assert.strictEqual(hasUntitledTab, false, 'Untitled source editor should be closed after save');
    assert.strictEqual(untitledDoc.isClosed, true, 'Untitled document should be closed without a save prompt');

    const activeDoc = vscode.window.activeTextEditor?.document;
    assert.ok(activeDoc, 'Scratchpad should be opened automatically');
    assert.strictEqual(activeDoc?.uri.scheme, 'codebench-scratchpad');
    assert.strictEqual(activeDoc?.getText(), expectedContent, 'Opened scratchpad should show the original untitled content');
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

  test('Create scratchpad in folder via command assigns parent folder', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }
    for (const folder of [...scratchpadsProvider.scratchpadService.getFolders()]) {
      await scratchpadsProvider.deleteFolderForTools(folder.id);
    }

    const parentFolder = await scratchpadsProvider.addFolder('Parent Folder');

    stub(vscode.window, 'showQuickPick', async () => ({ label: 'Markdown', extension: '.md' } as any));

    await vscode.commands.executeCommand('vs-codebench.createScratchpadInFolder', { id: parentFolder.id });

    const files = scratchpadsProvider.scratchpadService.getScratchFiles();
    assert.strictEqual(files.length, 1, 'One scratchpad should be created');
    assert.strictEqual(files[0].parentId, parentFolder.id, 'Scratchpad should be created in the selected folder');
    assert.strictEqual(files[0].name.endsWith('.md'), true, 'Scratchpad should use the selected extension');
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

  test('Opens same-named scratchpads from different folders as distinct documents', async function () {
    this.timeout(20000);
    const { scratchpadsProvider } = extension.exports as any;
    assert.ok(scratchpadsProvider, 'scratchpadsProvider should be available');

    for (const f of [...scratchpadsProvider.scratchpadService.getScratchFiles()]) {
      await scratchpadsProvider.scratchpadService.deleteScratchFile(f.id);
    }
    for (const folder of [...scratchpadsProvider.scratchpadService.getFolders()]) {
      await scratchpadsProvider.deleteFolderForTools(folder.id);
    }

    const folderA = await scratchpadsProvider.addFolder('Folder A');
    const folderB = await scratchpadsProvider.addFolder('Folder B');
    const first = await scratchpadsProvider.scratchpadService.createScratchFile('notes.md', 'markdown', folderA.id);
    const second = await scratchpadsProvider.scratchpadService.createScratchFile('notes.md', 'markdown', folderB.id);

    await scratchpadsProvider.scratchpadService.updateFileContent(first.id, '# A');
    await scratchpadsProvider.scratchpadService.updateFileContent(second.id, '# B');

    await scratchpadsProvider.openScratchFile(first.id);
    const firstDoc = vscode.window.activeTextEditor?.document;

    await scratchpadsProvider.openScratchFile(second.id);
    const secondDoc = vscode.window.activeTextEditor?.document;

    assert.ok(firstDoc, 'First scratchpad document should be opened');
    assert.ok(secondDoc, 'Second scratchpad document should be opened');
    assert.strictEqual(firstDoc?.uri.scheme, 'codebench-scratchpad');
    assert.strictEqual(secondDoc?.uri.scheme, 'codebench-scratchpad');
    assert.notStrictEqual(firstDoc?.uri.toString(), secondDoc?.uri.toString());
    assert.strictEqual(firstDoc?.getText(), '# A');
    assert.strictEqual(secondDoc?.getText(), '# B');
  });
});

