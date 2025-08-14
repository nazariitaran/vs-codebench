import * as assert from 'assert';
import { ScratchpadService } from '../../features/scratchpads/ScratchpadService';
import { createMockExtensionContext } from '../testUtils';

suite('Scratchpad rename: extension handling and spaces', () => {
  let mockContext: any;
  let service: ScratchpadService;

  setup(() => {
    mockContext = createMockExtensionContext();
    service = new ScratchpadService(mockContext);
  });

  teardown(() => {
    // Clean up the unique temp directory created for this mock context
    const fs = require('fs');
    const path = require('path');
    const tempRoot = require('path').dirname(mockContext.globalStorageUri.fsPath);
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('preserves original extension when none provided in new name', async () => {
    const f = await service.createScratchFile('scratchpad_1.json', 'json');

    await service.renameScratchFile(f.id, 'some json'); // no extension provided

    const updated = service.getScratchFile(f.id)!;
    assert.strictEqual(updated.name, 'some json.json');
  });

  test('replaces extension when one is provided in new name', async () => {
    const f = await service.createScratchFile('scratchpad_2.json', 'json');

    await service.renameScratchFile(f.id, 'some.txt'); // explicit extension

    const updated = service.getScratchFile(f.id)!;
    assert.strictEqual(updated.name, 'some.txt');
  });

  test('allows spaces in the middle of file name', async () => {
    const f = await service.createScratchFile('scratchpad_3.json', 'json');

    await service.renameScratchFile(f.id, 'some json.json');

    const updated = service.getScratchFile(f.id)!;
    assert.strictEqual(updated.name, 'some json.json');
  });
});

