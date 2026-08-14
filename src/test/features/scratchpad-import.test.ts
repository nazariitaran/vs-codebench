import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ScratchpadService, ImportResult } from '../../features/scratchpads/ScratchpadService';
import { createNamespacedStorage } from '../../common/storage/StorageService';
import { createMockExtensionContext } from '../testUtils';

suite('ScratchpadService - import from directory', () => {
  let mockContext: any;
  let service: ScratchpadService;
  let tempDir: string;

  setup(async () => {
    mockContext = createMockExtensionContext();
    service = new ScratchpadService(mockContext);
    await service.loadScratchFiles();
    tempDir = path.join(process.cwd(), '.test-import-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
  });

  teardown(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      const tempRoot = path.dirname(mockContext.globalStorageUri.fsPath);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function createFile(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
  }

  function createBinaryFile(filePath: string, buffer: Buffer): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
  }

  suite('importScratchpadsFromDirectory', () => {
    test('imports text files from a directory', async () => {
      createFile(path.join(tempDir, 'file1.txt'), 'hello world');
      createFile(path.join(tempDir, 'file2.md'), '# Markdown content');

      // Verify files exist
      assert.ok(fs.existsSync(path.join(tempDir, 'file1.txt')), 'file1.txt should exist');
      assert.ok(fs.existsSync(path.join(tempDir, 'file2.md')), 'file2.md should exist');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 2);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.overwritten, 0);
      const files = service.getScratchFiles();
      assert.strictEqual(files.length, 2);
      const names = files.map(f => f.name).sort();
      assert.deepStrictEqual(names, ['file1.txt', 'file2.md']);
    });

    test('skips binary files', async () => {
      createFile(path.join(tempDir, 'text.txt'), 'hello world');
      // PDF-like binary: valid bytes then null at position 5
      const binaryBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x0A, 0x00, 0x00, 0x00]);
      createBinaryFile(path.join(tempDir, 'binary.pdf'), binaryBuffer);
      createFile(path.join(tempDir, 'code.js'), 'const x = 1;');

      // Verify the binary file has null bytes within first 8KB
      const binaryContent = fs.readFileSync(path.join(tempDir, 'binary.pdf'));
      assert.ok(binaryContent.includes(0x00), 'binary.pdf should contain null bytes');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      // text.txt and code.js should import; binary.pdf should be skipped
      assert.strictEqual(result.imported, 2, `imported=${result.imported}, errors=${result.errorMessages.join('; ')}`);
      assert.strictEqual(result.skipped, 1, `skipped=${result.skipped}`);
    });

    test('mirrors directory structure as folders', async () => {
      const subDir = path.join(tempDir, 'src');
      fs.mkdirSync(subDir, { recursive: true });
      createFile(path.join(tempDir, 'root.txt'), 'root file');
      createFile(path.join(subDir, 'nested.txt'), 'nested file');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 2);
      const folders = service.getFolders();
      assert.strictEqual(folders.length, 1);
      assert.strictEqual(folders[0].name, 'src');
      const rootFile = service.getScratchFiles().find(f => f.name === 'root.txt');
      const nestedFile = service.getScratchFiles().find(f => f.name === 'nested.txt');
      assert.strictEqual(rootFile?.parentId, undefined);
      assert.strictEqual(nestedFile?.parentId, folders[0].id);
    });

    test('handles deep nested directories (depth > 10) by flattening', async () => {
      // Create a 12-level deep structure: d1/d2/.../d12/file.txt
      // This exceeds the 10-level limit, so d1-d10 are created and file goes into d10
      let current = tempDir;
      const parts = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'd12'];
      for (const part of parts) {
        current = path.join(current, part);
        fs.mkdirSync(current, { recursive: true });
      }
      createFile(path.join(current, 'deep.txt'), 'deep content');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      // Should still import successfully, flattening into deepest valid folder (d10)
      assert.strictEqual(result.imported, 1);
      const folders = service.getFolders();
      // d1 through d10 should be created (depth 10 = max allowed)
      assert.strictEqual(folders.length, 10);
      const deepFile = service.getScratchFiles().find(f => f.name === 'deep.txt');
      assert.ok(deepFile, 'deep.txt should be imported');
      // Parent should be d10 (the deepest valid folder)
      assert.strictEqual(deepFile?.parentId, folders[9].id);
    });

    test('imports dotfiles (hidden files)', async () => {
      createFile(path.join(tempDir, '.env'), 'API_KEY=secret');
      createFile(path.join(tempDir, '.gitignore'), 'node_modules/');
      createFile(path.join(tempDir, 'readme.md'), '# Hello');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 3);
      const files = service.getScratchFiles();
      const names = files.map(f => f.name);
      assert.ok(names.includes('.env'));
      assert.ok(names.includes('.gitignore'));
      assert.ok(names.includes('readme.md'));
    });

    test('overwrites existing scratchpad with same name in same folder', async () => {
      const existing = await service.createScratchFile('file.txt', 'plaintext');
      await service.updateFileContent(existing.id, 'old content');

      createFile(path.join(tempDir, 'file.txt'), 'new content');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 0);
      assert.strictEqual(result.overwritten, 1);
      const updated = service.getScratchFile(existing.id)!;
      assert.strictEqual(service.loadFileContent(updated.id), 'new content');
      // Should still be the same file (same ID)
      assert.strictEqual(updated.id, existing.id);
    });

    test('keeps same-named files in different folders isolated', async () => {
      const folderA = path.join(tempDir, 'a');
      const folderB = path.join(tempDir, 'b');
      fs.mkdirSync(folderA, { recursive: true });
      fs.mkdirSync(folderB, { recursive: true });

      createFile(path.join(folderA, 'notes.md'), '# Folder A');
      createFile(path.join(folderB, 'notes.md'), '# Folder B');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 2);
      assert.strictEqual(result.overwritten, 0);

      const notesFiles = service.getScratchFiles().filter(file => file.name === 'notes.md');
      assert.strictEqual(notesFiles.length, 2);
      assert.notStrictEqual(notesFiles[0].backingFileName, notesFiles[1].backingFileName);

      const folderMap = new Map(service.getFolders().map(folder => [folder.id, folder.name]));
      const fileByFolderName = new Map(notesFiles.map(file => [folderMap.get(file.parentId!), file]));

      assert.strictEqual(service.loadFileContent(fileByFolderName.get('a')!.id), '# Folder A');
      assert.strictEqual(service.loadFileContent(fileByFolderName.get('b')!.id), '# Folder B');
    });

    test('can import into a specific parent folder', async () => {
      const parentFolder = await service.addFolder('ImportTarget');
      createFile(path.join(tempDir, 'file.txt'), 'file content');

      const result = await service.importScratchpadsFromDirectory(tempDir, parentFolder.id);

      assert.strictEqual(result.imported, 1);
      const files = service.getScratchFiles();
      assert.strictEqual(files.length, 1);
      assert.strictEqual(files[0].parentId, parentFolder.id);
    });

    test('returns correct language from extension', async () => {
      createFile(path.join(tempDir, 'script.js'), 'const x = 1;');
      createFile(path.join(tempDir, 'data.json'), '{"key": "value"}');
      createFile(path.join(tempDir, 'doc.md'), '# Title');

      await service.importScratchpadsFromDirectory(tempDir);

      const jsFile = service.getScratchFiles().find(f => f.name === 'script.js');
      const jsonFile = service.getScratchFiles().find(f => f.name === 'data.json');
      const mdFile = service.getScratchFiles().find(f => f.name === 'doc.md');
      assert.strictEqual(jsFile?.language, 'javascript');
      assert.strictEqual(jsonFile?.language, 'json');
      assert.strictEqual(mdFile?.language, 'markdown');
    });

    test('empty directory returns zero imported', async () => {
      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 0);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.overwritten, 0);
      assert.strictEqual(result.errors, 0);
    });

    test('skips files with null bytes in content', async () => {
      // Plain text file with null byte embedded early
      const binaryBuffer = Buffer.from([0x74, 0x65, 0x78, 0x74, 0x00, 0x62, 0x69, 0x6e]);
      createBinaryFile(path.join(tempDir, 'bad.txt'), binaryBuffer);

      // Verify null byte is present
      const content = fs.readFileSync(path.join(tempDir, 'bad.txt'));
      assert.ok(content.includes(0x00), 'bad.txt should contain null byte');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 0, `imported=${result.imported}, errors=${result.errorMessages.join('; ')}`);
      assert.strictEqual(result.skipped, 1, `skipped=${result.skipped}`);
    });

    test('progress callback is called for each file', async () => {
      createFile(path.join(tempDir, 'a.txt'), 'content a');
      createFile(path.join(tempDir, 'b.txt'), 'content b');
      createFile(path.join(tempDir, 'c.txt'), 'content c');

      const progressCalls: { current: number; total: number; fileName: string }[] = [];
      await service.importScratchpadsFromDirectory(
        tempDir,
        undefined,
        (current, total, fileName) => {
          progressCalls.push({ current, total, fileName });
        }
      );

      assert.strictEqual(progressCalls.length, 3);
      assert.strictEqual(progressCalls[0].current, 1);
      assert.strictEqual(progressCalls[0].total, 3);
      assert.strictEqual(progressCalls[0].fileName, 'a.txt');
      assert.strictEqual(progressCalls[1].current, 2);
      assert.strictEqual(progressCalls[1].fileName, 'b.txt');
      assert.strictEqual(progressCalls[2].current, 3);
      assert.strictEqual(progressCalls[2].fileName, 'c.txt');
    });

    test('multiple directories in import keep correct folder structure', async () => {
      const srcDir = path.join(tempDir, 'src');
      const libDir = path.join(tempDir, 'lib');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(libDir, { recursive: true });
      createFile(path.join(srcDir, 'main.js'), '// main');
      createFile(path.join(libDir, 'util.js'), '// util');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 2);
      const folders = service.getFolders();
      const folderNames = folders.map(f => f.name).sort();
      assert.deepStrictEqual(folderNames, ['lib', 'src']);
      const mainFile = service.getScratchFiles().find(f => f.name === 'main.js');
      const libFile = service.getScratchFiles().find(f => f.name === 'util.js');
      const srcFolder = folders.find(f => f.name === 'src')!;
      const libFolder = folders.find(f => f.name === 'lib')!;
      assert.strictEqual(mainFile?.parentId, srcFolder.id);
      assert.strictEqual(libFile?.parentId, libFolder.id);
    });

    test('skips large files with null byte near 8KB boundary', async () => {
      // Create a file larger than 8KB with null byte at position 8000
      const largeContent = Buffer.alloc(8500, 'x'.charCodeAt(0));
      largeContent[8000] = 0; // null byte near end of first 8KB sample
      createBinaryFile(path.join(tempDir, 'large.bin'), largeContent);

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 0);
      assert.strictEqual(result.skipped, 1);
    });

    test('imports whitespace-only files', async () => {
      createFile(path.join(tempDir, 'empty.txt'), '');
      createFile(path.join(tempDir, 'spaces.txt'), '   ');
      createFile(path.join(tempDir, 'tabs.txt'), '\t\t');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 3);
      const files = service.getScratchFiles();
      assert.strictEqual(files.length, 3);
    });

    test('imports files with unicode content', async () => {
      createFile(path.join(tempDir, 'emoji.txt'), 'Hello 👋 🌍');
      createFile(path.join(tempDir, 'unicode.txt'), '日本語テスト');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 2);
      const content = service.loadFileContent(service.getScratchFiles().find(f => f.name === 'emoji.txt')!.id);
      assert.ok(content.includes('👋'));
    });

    test('correctly handles import when limit is reached mid-process', async () => {
      // Create 402 files (exceeds 400 limit by 2)
      for (let i = 0; i < 402; i++) {
        createFile(path.join(tempDir, `file${i}.txt`), `content ${i}`);
      }

      const result = await service.importScratchpadsFromDirectory(tempDir);

      // 400 should import, 2 should be skipped
      assert.strictEqual(result.imported, 400);
      assert.strictEqual(result.skipped, 2);
    });

    test('preserves multi-level folder nesting', async () => {
      // Create a 3-level deep structure: a/b/c/file.txt
      const subDir = path.join(tempDir, 'a', 'b', 'c');
      fs.mkdirSync(subDir, { recursive: true });
      createFile(path.join(subDir, 'nested.txt'), 'deeply nested content');

      const result = await service.importScratchpadsFromDirectory(tempDir);

      assert.strictEqual(result.imported, 1);
      const folders = service.getFolders();
      assert.strictEqual(folders.length, 3);
      const names = folders.map(f => f.name).sort();
      assert.deepStrictEqual(names, ['a', 'b', 'c']);
      const nestedFile = service.getScratchFiles().find(f => f.name === 'nested.txt');
      assert.ok(nestedFile, 'file should be imported');
      // Parent should be 'c' folder
      const cFolder = folders.find(f => f.name === 'c');
      assert.strictEqual(nestedFile?.parentId, cFolder?.id);
    });

    test('detects language for uncommon extensions', async () => {
      createFile(path.join(tempDir, 'script.py'), 'print("hello")');
      createFile(path.join(tempDir, 'program.go'), 'package main');
      createFile(path.join(tempDir, 'code.rs'), 'fn main() {}');
      createFile(path.join(tempDir, 'shell.sh'), '#!/bin/bash');

      await service.importScratchpadsFromDirectory(tempDir);

      const pyFile = service.getScratchFiles().find(f => f.name === 'script.py');
      const goFile = service.getScratchFiles().find(f => f.name === 'program.go');
      const rsFile = service.getScratchFiles().find(f => f.name === 'code.rs');
      const shFile = service.getScratchFiles().find(f => f.name === 'shell.sh');
      assert.strictEqual(pyFile?.language, 'python');
      assert.strictEqual(goFile?.language, 'go');
      assert.strictEqual(rsFile?.language, 'rust');
      assert.strictEqual(shFile?.language, 'shellscript');
    });

    test('findNextImportFolderName returns _import when no folders exist', async () => {
      const name = service.findNextImportFolderName();
      assert.strictEqual(name, '_import');
    });

    test('findNextImportFolderName increments when _import exists', async () => {
      await service.addFolder('_import', undefined);
      const name = service.findNextImportFolderName();
      assert.strictEqual(name, '_import_1');
    });

    test('findNextImportFolderName finds next available number', async () => {
      await service.addFolder('_import', undefined);
      await service.addFolder('_import_1', undefined);
      await service.addFolder('_import_3', undefined);
      const name = service.findNextImportFolderName();
      assert.strictEqual(name, '_import_2');
    });
  });

  suite('migration', () => {
    test('applies cumulative migration for long-skipped scratchpads', async () => {
      const storage = createNamespacedStorage(mockContext, 'scratchpads');
      await storage.store('metadata', {
        version: 1,
        files: [
          {
            id: 'legacy-a',
            name: 'notes.md',
            content: '# Legacy A',
            createdAt: 1,
            lastModified: 2,
            order: 0
          },
          {
            id: 'legacy-b',
            name: 'notes.md',
            content: '# Legacy B',
            createdAt: 3,
            lastModified: 4,
            order: 1
          }
        ]
      }, { scope: 'auto' });

      service = new ScratchpadService(mockContext);
      await service.loadScratchFiles();

      const migratedFiles = service.getScratchFiles();
      assert.strictEqual(migratedFiles.length, 2);
      assert.strictEqual(migratedFiles.every(file => file.parentId === undefined), true);
      assert.strictEqual(migratedFiles.every(file => !!file.backingFileName), true);
      assert.strictEqual(new Set(migratedFiles.map(file => file.backingFileName)).size, 2);
      assert.strictEqual(service.loadFileContent('legacy-a'), '# Legacy A');
      assert.strictEqual(service.loadFileContent('legacy-b'), '# Legacy B');

      const stored = await storage.retrieve<any>('metadata', undefined, { scope: 'auto' });
      assert.strictEqual(stored.version, 3);
      assert.strictEqual('content' in stored.files[0], false);
      assert.strictEqual('content' in stored.files[1], false);
      assert.strictEqual(fs.readFileSync(service.getFilePath('legacy-a'), 'utf8'), '# Legacy A');
      assert.strictEqual(fs.readFileSync(service.getFilePath('legacy-b'), 'utf8'), '# Legacy B');
    });

    test('does not rewrite metadata from a newer scratchpad version', async () => {
      const storage = createNamespacedStorage(mockContext, 'scratchpads');
      await storage.store('metadata', {
        version: 99,
        files: [
          {
            id: 'future-file',
            name: 'future.md',
            content: '# Future',
            backingFileName: 'future-storage.md',
            createdAt: 1,
            lastModified: 2,
            order: 0,
            parentId: undefined
          }
        ],
        folders: []
      }, { scope: 'auto' });

      service = new ScratchpadService(mockContext);
      await service.loadScratchFiles();

      const stored = await storage.retrieve<any>('metadata', undefined, { scope: 'auto' });
      assert.strictEqual(stored.version, 99);
      assert.strictEqual(stored.files[0].backingFileName, 'future-storage.md');
    });

    test('strips legacy content from unreleased version 3 metadata', async () => {
      const storage = createNamespacedStorage(mockContext, 'scratchpads');
      await storage.store('metadata', {
        version: 3,
        files: [
          {
            id: 'dev-v3-file',
            name: 'draft.md',
            content: '# Draft',
            backingFileName: 'dev-v3-file.md',
            createdAt: 1,
            lastModified: 2,
            order: 0,
            parentId: undefined
          }
        ],
        folders: []
      }, { scope: 'auto' });

      service = new ScratchpadService(mockContext);
      await service.loadScratchFiles();

      assert.strictEqual(service.loadFileContent('dev-v3-file'), '# Draft');

      const stored = await storage.retrieve<any>('metadata', undefined, { scope: 'auto' });
      assert.strictEqual(stored.version, 3);
      assert.strictEqual('content' in stored.files[0], false);
    });
  });
});