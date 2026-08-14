import * as assert from 'assert';
import * as fs from 'fs';
import { ScratchpadService } from '../../features/scratchpads/ScratchpadService';
import { createMockExtensionContext } from '../testUtils';

suite('ScratchpadService - folders', () => {
  let mockContext: any;
  let service: ScratchpadService;

  setup(async () => {
    mockContext = createMockExtensionContext();
    service = new ScratchpadService(mockContext);
    await service.loadScratchFiles();
  });

  teardown(() => {
    const fs = require('fs');
    const path = require('path');
    const tempRoot = path.dirname(mockContext.globalStorageUri.fsPath);
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  suite('folder CRUD', () => {
    test('addFolder creates a folder at root', async () => {
      const folder = await service.addFolder('Work');
      assert.strictEqual(folder.name, 'Work');
      assert.strictEqual(folder.parentId, undefined);
      assert.ok(folder.id);
      assert.ok(folder.createdAt);
      assert.ok(folder.updatedAt);
    });

    test('addFolder creates a subfolder under a parent', async () => {
      const parent = await service.addFolder('Parent');
      const child = await service.addFolder('Child', parent.id);
      assert.strictEqual(child.name, 'Child');
      assert.strictEqual(child.parentId, parent.id);
    });

    test('addFolder assigns order sequentially', async () => {
      const f1 = await service.addFolder('Folder 1');
      const f2 = await service.addFolder('Folder 2');
      const f3 = await service.addFolder('Folder 3');
      assert.strictEqual(f1.order, 0);
      assert.strictEqual(f2.order, 1);
      assert.strictEqual(f3.order, 2);
    });

    test('editFolder updates name', async () => {
      const folder = await service.addFolder('Old Name');
      await service.editFolder(folder.id, 'New Name');
      const updated = service.getFolderById(folder.id);
      assert.strictEqual(updated?.name, 'New Name');
    });

    test('editFolder trims whitespace', async () => {
      const folder = await service.addFolder('Folder');
      await service.editFolder(folder.id, '  trimmed  ');
      assert.strictEqual(service.getFolderById(folder.id)?.name, 'trimmed');
    });

    test('deleteFolder removes the folder', async () => {
      const folder = await service.addFolder('To Delete');
      await service.deleteFolder(folder.id);
      assert.strictEqual(service.getFolderById(folder.id), undefined);
    });

    test('deleteFolder is recursive - deletes subfolders', async () => {
      const p = await service.addFolder('Parent');
      const c = await service.addFolder('Child', p.id);
      const gc = await service.addFolder('GrandChild', c.id);
      await service.deleteFolder(p.id);
      assert.strictEqual(service.getFolderById(p.id), undefined);
      assert.strictEqual(service.getFolderById(c.id), undefined);
      assert.strictEqual(service.getFolderById(gc.id), undefined);
    });

    test('deleteFolder removes contained files recursively', async () => {
      const folder = await service.addFolder('Folder');
      const file = await service.createScratchFile('test.txt');
      await service.moveToFolder(file.id, folder.id);

      const nestedFolder = await service.addFolder('Nested', folder.id);
      const nestedFile = await service.createScratchFile('nested.txt');
      await service.moveToFolder(nestedFile.id, nestedFolder.id);

      const rootFilePath = service.getFilePath(file.id);
      const nestedFilePath = service.getFilePath(nestedFile.id);
      assert.strictEqual(fs.existsSync(rootFilePath), true);
      assert.strictEqual(fs.existsSync(nestedFilePath), true);

      await service.deleteFolder(folder.id);

      assert.strictEqual(service.getScratchFile(file.id), undefined);
      assert.strictEqual(service.getScratchFile(nestedFile.id), undefined);
      assert.strictEqual(service.getFolderById(nestedFolder.id), undefined);
      assert.strictEqual(fs.existsSync(rootFilePath), false);
      assert.strictEqual(fs.existsSync(nestedFilePath), false);
    });
  });

  suite('getFolderDepth', () => {
    test('returns 1 for root folder', async () => {
      const f = await service.addFolder('Root');
      assert.strictEqual(service.getFolderDepth(f.id), 1);
    });

    test('returns 2 for folder nested one level deep', async () => {
      const p = await service.addFolder('Parent');
      const c = await service.addFolder('Child', p.id);
      assert.strictEqual(service.getFolderDepth(c.id), 2);
    });

    test('returns correct depth for deeply nested folder', async () => {
      const l1 = await service.addFolder('L1');
      const l2 = await service.addFolder('L2', l1.id);
      const l3 = await service.addFolder('L3', l2.id);
      const l4 = await service.addFolder('L4', l3.id);
      const l5 = await service.addFolder('L5', l4.id);
      assert.strictEqual(service.getFolderDepth(l5.id), 5);
    });
  });

  suite('moveToFolder', () => {
    test('moves file from root to folder', async () => {
      const folder = await service.addFolder('Folder');
      const file = await service.createScratchFile('test.txt');
      await service.moveToFolder(file.id, folder.id);
      const moved = service.getScratchFile(file.id);
      assert.strictEqual(moved?.parentId, folder.id);
    });

    test('moves file from folder to root', async () => {
      const folder = await service.addFolder('Folder');
      const file = await service.createScratchFile('test.txt');
      await service.moveToFolder(file.id, folder.id);
      await service.moveToFolder(file.id, undefined);
      const moved = service.getScratchFile(file.id);
      assert.strictEqual(moved?.parentId, undefined);
    });

    test('moves folder to another folder (within depth limit)', async () => {
      const p1 = await service.addFolder('P1');
      const p2 = await service.addFolder('P2');
      const child = await service.addFolder('Child', p1.id);
      await service.moveToFolder(child.id, p2.id);
      const moved = service.getFolderById(child.id);
      assert.strictEqual(moved?.parentId, p2.id);
    });

    test('throws when moving folder into itself', async () => {
      const folder = await service.addFolder('Folder');
      await assert.rejects(
        () => service.moveToFolder(folder.id, folder.id),
        /Cannot move folder into itself or its subfolders/
      );
    });

    test('throws when moving folder into its descendant', async () => {
      const parent = await service.addFolder('Parent');
      const child = await service.addFolder('Child', parent.id);
      await assert.rejects(
        () => service.moveToFolder(parent.id, child.id),
        /Cannot move folder into itself or its subfolders/
      );
    });

    test('throws when moving folder would exceed max depth (10)', async () => {
      // Build two parallel chains so that we don't trigger isDescendantOf
      // Chain 1: l1 -> l2 -> ... -> l10 (depth 10 at l10)
      const l1 = await service.addFolder('L1');
      const l2 = await service.addFolder('L2', l1.id);
      const l3 = await service.addFolder('L3', l2.id);
      const l4 = await service.addFolder('L4', l3.id);
      const l5 = await service.addFolder('L5', l4.id);
      const l6 = await service.addFolder('L6', l5.id);
      const l7 = await service.addFolder('L7', l6.id);
      const l8 = await service.addFolder('L8', l7.id);
      const l9 = await service.addFolder('L9', l8.id);
      const l10 = await service.addFolder('L10', l9.id);
      // Chain 2: r1 -> r2 (depth 2 at r2)
      const r1 = await service.addFolder('R1');
      const r2 = await service.addFolder('R2', r1.id);
      // l10 is at depth 10, r2 is at depth 2
      // moveToFolder(l1, r2) -> targetDepth(r2)=2 + maxFolderDepth(l1)=10 = 12 > 10
      await assert.rejects(
        () => service.moveToFolder(l1.id, r2.id),
        /exceed maximum depth.*10 levels/
      );
    });

    test('moveToFolder normalizes source sibling order after removal', async () => {
      const f1 = await service.addFolder('F1');
      const f2 = await service.addFolder('F2');
      const f3 = await service.addFolder('F3');
      const folder = await service.addFolder('Folder');
      // Move f1 into folder
      await service.moveToFolder(f1.id, folder.id);
      // f2 and f3 should re-normalize to orders 0 and 1
      const f2Updated = service.getFolderById(f2.id);
      const f3Updated = service.getFolderById(f3.id);
      assert.strictEqual(f2Updated?.order, 0);
      assert.strictEqual(f3Updated?.order, 1);
    });

    test('throws when moving folder into a nested descendant', async () => {
      const p = await service.addFolder('Parent');
      const c = await service.addFolder('Child', p.id);
      const gc = await service.addFolder('GrandChild', c.id);
      await assert.rejects(
        () => service.moveToFolder(p.id, gc.id),
        /Cannot move folder into itself or its subfolders/
      );
    });

    test('moves folder to root when target folder is omitted', async () => {
      const parent = await service.addFolder('Parent');
      const folder = await service.addFolder('Folder', parent.id);
      await service.moveToFolder(folder.id, undefined);
      const moved = service.getFolderById(folder.id);
      assert.strictEqual(moved?.parentId, undefined);
    });
  });

  suite('countFolderItems', () => {
    test('returns 0 for empty folder', async () => {
      const folder = await service.addFolder('Empty');
      assert.strictEqual(service.countFolderItems(folder.id), 0);
    });

    test('counts direct files in folder', async () => {
      const folder = await service.addFolder('Folder');
      await service.createScratchFile('f1.txt');
      await service.createScratchFile('f2.txt');
      await service.createScratchFile('f3.txt');
      const files = service.getScratchFiles();
      for (const f of files) {
        await service.moveToFolder(f.id, folder.id);
      }
      assert.strictEqual(service.countFolderItems(folder.id), 3);
    });

    test('counts nested subfolder and its contents', async () => {
      const parent = await service.addFolder('Parent');
      const child = await service.addFolder('Child', parent.id);
      const file = await service.createScratchFile('file.txt');
      await service.moveToFolder(file.id, child.id);
      // Child folder itself counts as 1, plus 1 file inside
      assert.strictEqual(service.countFolderItems(parent.id), 2);
    });
  });

  suite('reorderItem', () => {
    test('reorders files within same parent (root)', async () => {
      const f1 = await service.createScratchFile('file1.txt');
      const f2 = await service.createScratchFile('file2.txt');
      const f3 = await service.createScratchFile('file3.txt');
      await service.reorderItem(f3.id, f1.id, 'before');
      const files = service.getScratchFiles();
      assert.strictEqual(files[0].id, f3.id);
      assert.strictEqual(files[1].id, f1.id);
      assert.strictEqual(files[2].id, f2.id);
    });

    test('reorders folders within same parent', async () => {
      const f1 = await service.addFolder('F1');
      const f2 = await service.addFolder('F2');
      const f3 = await service.addFolder('F3');
      // f1=0, f2=1, f3=2 → reorder f3 before f1 → f3=0, f1=1, f2=2
      await service.reorderItem(f3.id, f1.id, 'before');
      const allFolders = service.getFolders();
      const f1After = allFolders.find(f => f.id === f1.id)!;
      const f2After = allFolders.find(f => f.id === f2.id)!;
      const f3After = allFolders.find(f => f.id === f3.id)!;
      assert.strictEqual(f3After.order, 0);
      assert.strictEqual(f1After.order, 1);
      assert.strictEqual(f2After.order, 2);
    });

    test('reorderItem updates dragged folder order when target is in different parent', async () => {
      // reorderItem with cross-parent: child folder moves from p1 to p2's parent level
      // and both get normalized orders in their respective parents
      const p1 = await service.addFolder('P1');
      const p2 = await service.addFolder('P2');
      const child = await service.addFolder('Child', p1.id);
      // Move child out of p1 and to the root level (same as p2)
      await service.reorderItem(child.id, p2.id, 'after');
      const moved = service.getFolderById(child.id);
      // child should now be at root level (parentId = undefined), same as p2
      assert.strictEqual(moved?.parentId, undefined);
    });

    test('reorderItem throws when moving folder into its own descendant', async () => {
      const parent = await service.addFolder('Parent');
      const child = await service.addFolder('Child', parent.id);
      await assert.rejects(
        () => service.reorderItem(parent.id, child.id, 'after'),
        /Cannot move folder into itself or its subfolders/
      );
    });
  });

  suite('clearAll', () => {
    test('clears all folders along with files', async () => {
      const folder = await service.addFolder('Folder');
      const file = await service.createScratchFile('file.txt');
      await service.moveToFolder(file.id, folder.id);
      await service.clearAll();
      assert.strictEqual(service.getFolders().length, 0);
      assert.strictEqual(service.getScratchFiles().length, 0);
    });
  });

});
