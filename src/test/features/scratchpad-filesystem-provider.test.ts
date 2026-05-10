import * as assert from 'assert';
import * as vscode from 'vscode';
import { ScratchpadFileSystemProvider } from '../../features/scratchpads/ScratchpadFileSystemProvider';

suite('ScratchpadFileSystemProvider', () => {
  test('readFile waits for scratchpads to finish loading', async () => {
    let ready = false;
    let resolveReady: (() => void) | undefined;
    const whenReady = new Promise<void>(resolve => {
      resolveReady = resolve;
    });

    const provider = new ScratchpadFileSystemProvider({
      whenReady: () => whenReady,
      scratchpadService: {
        getScratchpadIdFromUri: () => 'scratch-1',
        getScratchFile: () => ready ? {
          id: 'scratch-1',
          name: 'notes.md',
          createdAt: 1,
          lastModified: 2
        } : undefined,
        loadFileContent: () => '# restored'
      }
    } as any);

    const uri = vscode.Uri.from({
      scheme: 'codebench-scratchpad',
      path: '/notes.md',
      query: 'id=scratch-1'
    });

    let settled = false;
    const readPromise = provider.readFile(uri).then(result => {
      settled = true;
      return result;
    });

    await Promise.resolve();
    assert.strictEqual(settled, false, 'readFile should wait for scratchpad loading');

    ready = true;
    resolveReady?.();

    const bytes = await readPromise;
    assert.strictEqual(new TextDecoder().decode(bytes), '# restored');
  });
});