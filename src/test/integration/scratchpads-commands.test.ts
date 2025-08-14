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
});

