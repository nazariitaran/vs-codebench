import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Bookmarks: Ordering and Gap Prevention', () => {
  let extension: vscode.Extension<any>;
  let workspaceFolder: string;
  let testFileUri: vscode.Uri;
  let bookmarksProvider: any;
  let bookmarkService: any;

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    assert.ok(extension, 'Extension should be found');
    if (!extension.isActive) {
      await extension.activate();
    }
    assert.ok(extension.isActive, 'Extension should be active');

    workspaceFolder = path.join(process.cwd(), '.test-workspace-ordering');
    if (!fs.existsSync(workspaceFolder)) {
      fs.mkdirSync(workspaceFolder, { recursive: true });
    }

    const jsFilePath = path.join(workspaceFolder, 'test.js');
    fs.writeFileSync(jsFilePath, [
      'function line1() { }',
      'function line2() { }',
      'function line3() { }',
      'function line4() { }',
      'function line5() { }'
    ].join('\n'), 'utf8');
    testFileUri = vscode.Uri.file(jsFilePath);

    const document = await vscode.workspace.openTextDocument(testFileUri);
    await vscode.window.showTextDocument(document);

    ({ bookmarksProvider } = extension.exports as any);
    bookmarkService = bookmarksProvider.bookmarkService;
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    if (fs.existsSync(workspaceFolder)) {
      fs.rmSync(workspaceFolder, { recursive: true, force: true });
    }
  });

  setup(async () => {
    // Clear all bookmarks and folders before each test
    await bookmarkService.clearAll();
  });

  test('New bookmarks should always be added at the end, even with gaps', async function () {
    this.timeout(10000);
    
    // Add 4 bookmarks
    const b1 = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'Bookmark 1');
    const b2 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Bookmark 2');
    const b3 = await bookmarkService.addBookmark(testFileUri.toString(), 2, 'Bookmark 3');
    const b4 = await bookmarkService.addBookmark(testFileUri.toString(), 3, 'Bookmark 4');

    // Verify initial ordering
    assert.strictEqual(b1.order, 0, 'First bookmark should have order 0');
    assert.strictEqual(b2.order, 1, 'Second bookmark should have order 1');
    assert.strictEqual(b3.order, 2, 'Third bookmark should have order 2');
    assert.strictEqual(b4.order, 3, 'Fourth bookmark should have order 3');

    // Create a folder and move bookmark 2 into it (creating a gap)
    const folder = await bookmarkService.addFolder('Test Folder');
    await bookmarkService.moveToFolder(b2.id, folder.id);

    // Now add a new bookmark - it should go to the end, not fill the gap
    const b5 = await bookmarkService.addBookmark(testFileUri.toString(), 4, 'Bookmark 5');
    
    // Get all root-level bookmarks
    const rootBookmarks = bookmarkService.getBookmarks()
      .filter((b: any) => !b.parentId)
      .sort((a: any, b: any) => a.order - b.order);

    // Should have b1, b3, b4, b5 at root level (b2 was moved to folder)
    assert.strictEqual(rootBookmarks.length, 4, 'Should have 4 bookmarks at root level');
    assert.strictEqual(rootBookmarks[rootBookmarks.length - 1].id, b5.id, 
      'New bookmark should be at the end of the list');
    
    // After moveToFolder normalizes, orders at root should be:
    // folder=3 (was added after b4), b1=0, b3=1, b4=2
    // Then b5 gets added with order = max + 1 = 4 (after everything including folder)
    const b1Current = rootBookmarks.find((b: any) => b.id === b1.id);
    const b3Current = rootBookmarks.find((b: any) => b.id === b3.id);
    const b4Current = rootBookmarks.find((b: any) => b.id === b4.id);
    const b5Current = rootBookmarks.find((b: any) => b.id === b5.id);
    
    assert.strictEqual(b1Current.order, 0, 'b1 should have order 0 after normalization');
    assert.strictEqual(b3Current.order, 1, 'b3 should have order 1 after normalization');
    assert.strictEqual(b4Current.order, 2, 'b4 should have order 2 after normalization');
    assert.strictEqual(b5Current.order, 4, 'b5 should have order 4 (added after everything including folder at order 3)');
  });

  test('Moving items between parents should normalize both source and target orders', async function () {
    this.timeout(10000);
    
    // Create initial structure
    const folder = await bookmarkService.addFolder('Folder');
    const bInFolder = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'In Folder');
    await bookmarkService.moveToFolder(bInFolder.id, folder.id);
    
    const b1 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Bookmark 1');
    const b2 = await bookmarkService.addBookmark(testFileUri.toString(), 2, 'Bookmark 2');
    const b3 = await bookmarkService.addBookmark(testFileUri.toString(), 3, 'Bookmark 3');

    // Initial root orders should be: folder=0, b1=1, b2=2, b3=3
    assert.strictEqual(folder.order, 0);
    assert.strictEqual(b1.order, 1);
    assert.strictEqual(b2.order, 2);
    assert.strictEqual(b3.order, 3);

    // Move b2 into folder using reorderItem (simulating drag-drop before bInFolder)
    await bookmarkService.reorderItem(b2.id, bInFolder.id, 'before');

    // Check that root level has been normalized (no gaps)
    const rootItems = [...bookmarkService.getBookmarks(), ...bookmarkService.getFolders()]
      .filter((item: any) => !item.parentId)
      .sort((a: any, b: any) => a.order - b.order);

    assert.strictEqual(rootItems.length, 3, 'Should have 3 items at root');
    assert.strictEqual(rootItems[0].id, folder.id, 'Folder should be first');
    assert.strictEqual(rootItems[1].id, b1.id, 'Bookmark 1 should be second');
    assert.strictEqual(rootItems[2].id, b3.id, 'Bookmark 3 should be third');
    
    // Verify normalized orders (no gap where b2 was)
    assert.strictEqual(rootItems[0].order, 0, 'First item should have order 0');
    assert.strictEqual(rootItems[1].order, 1, 'Second item should have order 1');
    assert.strictEqual(rootItems[2].order, 2, 'Third item should have order 2 (no gap)');

    // Check folder contents are ordered correctly
    const folderItems = bookmarkService.getBookmarks()
      .filter((b: any) => b.parentId === folder.id)
      .sort((a: any, b: any) => a.order - b.order);

    assert.strictEqual(folderItems.length, 2, 'Folder should have 2 bookmarks');
    assert.strictEqual(folderItems[0].id, b2.id, 'Bookmark 2 should be first in folder');
    assert.strictEqual(folderItems[1].id, bInFolder.id, 'Original bookmark should be second');
    assert.strictEqual(folderItems[0].order, 0, 'First item in folder should have order 0');
    assert.strictEqual(folderItems[1].order, 1, 'Second item in folder should have order 1');
  });

  test('Deleting items should normalize remaining items orders', async function () {
    this.timeout(10000);
    
    // Create 5 bookmarks
    const b1 = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'Bookmark 1');
    const b2 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Bookmark 2');
    const b3 = await bookmarkService.addBookmark(testFileUri.toString(), 2, 'Bookmark 3');
    const b4 = await bookmarkService.addBookmark(testFileUri.toString(), 3, 'Bookmark 4');
    const b5 = await bookmarkService.addBookmark(testFileUri.toString(), 4, 'Bookmark 5');

    // Delete bookmarks 2 and 4 (creating gaps)
    await bookmarkService.deleteBookmark(b2.id);
    await bookmarkService.deleteBookmark(b4.id);

    // Get remaining bookmarks
    const remaining = bookmarkService.getBookmarks()
      .sort((a: any, b: any) => a.order - b.order);

    assert.strictEqual(remaining.length, 3, 'Should have 3 bookmarks remaining');
    
    // Orders should be normalized: 0, 1, 2 (no gaps)
    assert.strictEqual(remaining[0].order, 0, 'First bookmark should have order 0');
    assert.strictEqual(remaining[1].order, 1, 'Second bookmark should have order 1');
    assert.strictEqual(remaining[2].order, 2, 'Third bookmark should have order 2');
    
    // Verify it's the correct bookmarks
    assert.strictEqual(remaining[0].id, b1.id, 'First should be Bookmark 1');
    assert.strictEqual(remaining[1].id, b3.id, 'Second should be Bookmark 3');
    assert.strictEqual(remaining[2].id, b5.id, 'Third should be Bookmark 5');
  });

  test('New folders should always be added at the end', async function () {
    this.timeout(10000);
    
    // Create folders and bookmarks mixed
    const f1 = await bookmarkService.addFolder('Folder 1');
    const b1 = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'Bookmark 1');
    const f2 = await bookmarkService.addFolder('Folder 2');
    const b2 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Bookmark 2');

    // Verify mixed ordering
    assert.strictEqual(f1.order, 0);
    assert.strictEqual(b1.order, 1);
    assert.strictEqual(f2.order, 2);
    assert.strictEqual(b2.order, 3);

    // Move b1 into f1 (creating a gap)
    await bookmarkService.moveToFolder(b1.id, f1.id);

    // Add a new folder - it should go to the end
    const f3 = await bookmarkService.addFolder('Folder 3');
    
    const rootItems = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => !item.parentId)
      .sort((a: any, b: any) => a.order - b.order);

    // Should be: f1, f2, b2, f3
    assert.strictEqual(rootItems.length, 4, 'Should have 4 items at root');
    assert.strictEqual(rootItems[rootItems.length - 1].id, f3.id, 
      'New folder should be at the end');
    assert.ok(f3.order > b2.order, 'New folder order should be greater than last item');
  });

  test('Complex nested operations maintain proper ordering', async function () {
    this.timeout(10000);
    
    // Create complex structure
    const f1 = await bookmarkService.addFolder('Folder 1');
    const f2 = await bookmarkService.addFolder('Folder 2');
    const b1 = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'Bookmark 1');
    const b2 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Bookmark 2');
    const b3 = await bookmarkService.addBookmark(testFileUri.toString(), 2, 'Bookmark 3');

    // Create subfolder in f1
    const sf1 = await bookmarkService.addFolder('Subfolder 1', f1.id);
    
    // Move b2 to f1
    await bookmarkService.moveToFolder(b2.id, f1.id);
    
    // Move b3 to subfolder
    await bookmarkService.moveToFolder(b3.id, sf1.id);
    
    // Now reorder b1 to go after f2
    await bookmarkService.reorderItem(b1.id, f2.id, 'after');

    // Check root level ordering
    const rootItems = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => !item.parentId)
      .sort((a: any, b: any) => a.order - b.order);

    assert.strictEqual(rootItems.length, 3, 'Should have 3 items at root');
    assert.strictEqual(rootItems[0].id, f1.id, 'Folder 1 should be first');
    assert.strictEqual(rootItems[1].id, f2.id, 'Folder 2 should be second');
    assert.strictEqual(rootItems[2].id, b1.id, 'Bookmark 1 should be third');
    
    // Verify no gaps in ordering
    assert.strictEqual(rootItems[0].order, 0);
    assert.strictEqual(rootItems[1].order, 1);
    assert.strictEqual(rootItems[2].order, 2);

    // Check f1 contents
    const f1Items = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => item.parentId === f1.id)
      .sort((a: any, b: any) => a.order - b.order);

    assert.strictEqual(f1Items.length, 2, 'Folder 1 should have 2 items');
    assert.strictEqual(f1Items[0].order, 0);
    assert.strictEqual(f1Items[1].order, 1);

    // Check subfolder contents
    const sf1Items = bookmarkService.getBookmarks()
      .filter((b: any) => b.parentId === sf1.id);

    assert.strictEqual(sf1Items.length, 1, 'Subfolder should have 1 bookmark');
    assert.strictEqual(sf1Items[0].id, b3.id);
    assert.strictEqual(sf1Items[0].order, 0);
  });

  test('Deleting folders normalizes sibling orders', async function () {
    this.timeout(10000);
    
    // Create multiple folders and bookmarks
    const f1 = await bookmarkService.addFolder('Folder 1');
    const f2 = await bookmarkService.addFolder('Folder 2');
    const b1 = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'Bookmark 1');
    const f3 = await bookmarkService.addFolder('Folder 3');
    const b2 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Bookmark 2');

    // Delete f2 (middle folder)
    await bookmarkService.deleteFolder(f2.id);

    // Check remaining items are normalized
    const rootItems = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => !item.parentId)
      .sort((a: any, b: any) => a.order - b.order);

    assert.strictEqual(rootItems.length, 4, 'Should have 4 items at root');
    
    // Orders should be continuous: 0, 1, 2, 3
    for (let i = 0; i < rootItems.length; i++) {
      assert.strictEqual(rootItems[i].order, i, `Item ${i} should have order ${i}`);
    }

    // Verify correct items remain
    assert.strictEqual(rootItems[0].id, f1.id);
    assert.strictEqual(rootItems[1].id, b1.id);
    assert.strictEqual(rootItems[2].id, f3.id);
    assert.strictEqual(rootItems[3].id, b2.id);
  });

  test('Reordering within same parent maintains normalized orders', async function () {
    this.timeout(10000);
    
    // Create bookmarks
    const b1 = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'Bookmark 1');
    const b2 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Bookmark 2');
    const b3 = await bookmarkService.addBookmark(testFileUri.toString(), 2, 'Bookmark 3');
    const b4 = await bookmarkService.addBookmark(testFileUri.toString(), 3, 'Bookmark 4');

    // Move b3 before b1
    await bookmarkService.reorderItem(b3.id, b1.id, 'before');

    const bookmarks = bookmarkService.getBookmarks()
      .sort((a: any, b: any) => a.order - b.order);

    // New order should be: b3, b1, b2, b4
    assert.strictEqual(bookmarks[0].id, b3.id);
    assert.strictEqual(bookmarks[1].id, b1.id);
    assert.strictEqual(bookmarks[2].id, b2.id);
    assert.strictEqual(bookmarks[3].id, b4.id);

    // Orders should be normalized
    assert.strictEqual(bookmarks[0].order, 0);
    assert.strictEqual(bookmarks[1].order, 1);
    assert.strictEqual(bookmarks[2].order, 2);
    assert.strictEqual(bookmarks[3].order, 3);
  });

  test('Moving single bookmark out of folder normalizes both contexts', async function () {
    this.timeout(10000);
    
    // Create folder with single bookmark
    const folder = await bookmarkService.addFolder('Folder');
    const b1 = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'In Folder');
    await bookmarkService.moveToFolder(b1.id, folder.id);
    
    // Add some root level items
    const b2 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Root 1');
    const b3 = await bookmarkService.addBookmark(testFileUri.toString(), 2, 'Root 2');
    
    // Move b1 out of folder back to root using reorderItem (after b3)
    await bookmarkService.reorderItem(b1.id, b3.id, 'after');
    
    // Check folder is now empty
    const folderItems = bookmarkService.getBookmarks()
      .filter((b: any) => b.parentId === folder.id);
    assert.strictEqual(folderItems.length, 0, 'Folder should be empty');
    
    // Check root level has correct ordering (folder is also at root)
    const rootItems = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => !item.parentId)
      .sort((a: any, b: any) => a.order - b.order);
    
    assert.strictEqual(rootItems.length, 4, 'Should have 4 items at root (folder + 3 bookmarks)');
    assert.strictEqual(rootItems[0].id, folder.id, 'folder should be first');
    assert.strictEqual(rootItems[1].id, b2.id, 'b2 should be second');
    assert.strictEqual(rootItems[2].id, b3.id, 'b3 should be third');
    assert.strictEqual(rootItems[3].id, b1.id, 'b1 should be fourth (moved after b3)');
    
    // Verify orders are normalized
    assert.strictEqual(rootItems[0].order, 0);
    assert.strictEqual(rootItems[1].order, 1);
    assert.strictEqual(rootItems[2].order, 2);
    assert.strictEqual(rootItems[3].order, 3);
  });

  test('Nested folder operations with correct ordering at all levels', async function () {
    this.timeout(10000);
    
    // Create nested structure: folder -> subfolder -> bookmarks
    const folder = await bookmarkService.addFolder('Parent Folder');
    const subfolder = await bookmarkService.addFolder('Subfolder', folder.id);
    
    // Add bookmarks to subfolder
    const sb1 = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'Sub Bookmark 1');
    const sb2 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Sub Bookmark 2');
    const sb3 = await bookmarkService.addBookmark(testFileUri.toString(), 2, 'Sub Bookmark 3');
    
    await bookmarkService.moveToFolder(sb1.id, subfolder.id);
    await bookmarkService.moveToFolder(sb2.id, subfolder.id);
    await bookmarkService.moveToFolder(sb3.id, subfolder.id);
    
    // Reorder within subfolder (move sb3 before sb1)
    await bookmarkService.reorderItem(sb3.id, sb1.id, 'before');
    
    // Check subfolder ordering
    const subfolderItems = bookmarkService.getBookmarks()
      .filter((b: any) => b.parentId === subfolder.id)
      .sort((a: any, b: any) => a.order - b.order);
    
    assert.strictEqual(subfolderItems.length, 3);
    assert.strictEqual(subfolderItems[0].id, sb3.id, 'sb3 should be first');
    assert.strictEqual(subfolderItems[1].id, sb1.id, 'sb1 should be second');
    assert.strictEqual(subfolderItems[2].id, sb2.id, 'sb2 should be third');
    assert.strictEqual(subfolderItems[0].order, 0);
    assert.strictEqual(subfolderItems[1].order, 1);
    assert.strictEqual(subfolderItems[2].order, 2);
  });

  test('Moving bookmark from nested folder to parent and root levels', async function () {
    this.timeout(10000);
    
    // Create structure: root items, folder with subfolder with bookmarks
    const rootBookmark = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'Root Bookmark');
    const folder = await bookmarkService.addFolder('Folder');
    const subfolder = await bookmarkService.addFolder('Subfolder', folder.id);
    
    // Add bookmark to parent folder
    const folderBookmark = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'Folder Bookmark');
    await bookmarkService.moveToFolder(folderBookmark.id, folder.id);
    
    // Add bookmarks to subfolder
    const sb1 = await bookmarkService.addBookmark(testFileUri.toString(), 2, 'Sub 1');
    const sb2 = await bookmarkService.addBookmark(testFileUri.toString(), 3, 'Sub 2');
    await bookmarkService.moveToFolder(sb1.id, subfolder.id);
    await bookmarkService.moveToFolder(sb2.id, subfolder.id);
    
    // Move sb1 to parent folder (should go after folderBookmark)
    await bookmarkService.moveToFolder(sb1.id, folder.id);
    
    // Check parent folder has correct order
    const folderItems = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => item.parentId === folder.id)
      .sort((a: any, b: any) => a.order - b.order);
    
    assert.strictEqual(folderItems.length, 3, 'Folder should have 3 items');
    assert.strictEqual(folderItems[0].id, subfolder.id, 'Subfolder should be first');
    assert.strictEqual(folderItems[1].id, folderBookmark.id, 'Folder bookmark should be second');
    assert.strictEqual(folderItems[2].id, sb1.id, 'Moved bookmark should be last');
    
    // Move sb2 directly to root
    await bookmarkService.moveToFolder(sb2.id, undefined);
    
    // Check root level
    const rootItems = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => !item.parentId)
      .sort((a: any, b: any) => a.order - b.order);
    
    assert.strictEqual(rootItems.length, 3, 'Root should have 3 items');
    assert.strictEqual(rootItems[0].id, rootBookmark.id);
    assert.strictEqual(rootItems[1].id, folder.id);
    assert.strictEqual(rootItems[2].id, sb2.id, 'sb2 should be at end of root');
    
    // Verify all levels have normalized orders
    assert.strictEqual(rootItems[0].order, 0);
    assert.strictEqual(rootItems[1].order, 1);
    assert.strictEqual(rootItems[2].order, 2);
    
    // Check subfolder is now empty
    const subfolderItems = bookmarkService.getBookmarks()
      .filter((b: any) => b.parentId === subfolder.id);
    assert.strictEqual(subfolderItems.length, 0, 'Subfolder should be empty');
  });

  test('Reordering subfolders maintains correct ordering', async function () {
    this.timeout(10000);
    
    // Create parent folder with multiple subfolders
    const parent = await bookmarkService.addFolder('Parent');
    const sub1 = await bookmarkService.addFolder('Sub 1', parent.id);
    const sub2 = await bookmarkService.addFolder('Sub 2', parent.id);
    const sub3 = await bookmarkService.addFolder('Sub 3', parent.id);
    
    // Add a bookmark between folders
    const bookmark = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'Bookmark');
    await bookmarkService.moveToFolder(bookmark.id, parent.id);
    
    // Initial order in parent: sub1, sub2, sub3, bookmark
    let parentItems = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => item.parentId === parent.id)
      .sort((a: any, b: any) => a.order - b.order);
    
    assert.strictEqual(parentItems[0].id, sub1.id);
    assert.strictEqual(parentItems[1].id, sub2.id);
    assert.strictEqual(parentItems[2].id, sub3.id);
    assert.strictEqual(parentItems[3].id, bookmark.id);
    
    // Reorder sub3 before sub1
    await bookmarkService.reorderItem(sub3.id, sub1.id, 'before');
    
    // Check new order: sub3, sub1, sub2, bookmark
    parentItems = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => item.parentId === parent.id)
      .sort((a: any, b: any) => a.order - b.order);
    
    assert.strictEqual(parentItems.length, 4);
    assert.strictEqual(parentItems[0].id, sub3.id, 'sub3 should be first');
    assert.strictEqual(parentItems[1].id, sub1.id, 'sub1 should be second');
    assert.strictEqual(parentItems[2].id, sub2.id, 'sub2 should be third');
    assert.strictEqual(parentItems[3].id, bookmark.id, 'bookmark should be last');
    
    // Verify normalized orders
    assert.strictEqual(parentItems[0].order, 0);
    assert.strictEqual(parentItems[1].order, 1);
    assert.strictEqual(parentItems[2].order, 2);
    assert.strictEqual(parentItems[3].order, 3);
    
    // Now move sub2 after bookmark
    await bookmarkService.reorderItem(sub2.id, bookmark.id, 'after');
    
    // Check final order: sub3, sub1, bookmark, sub2
    parentItems = [...bookmarkService.getFolders(), ...bookmarkService.getBookmarks()]
      .filter((item: any) => item.parentId === parent.id)
      .sort((a: any, b: any) => a.order - b.order);
    
    assert.strictEqual(parentItems[0].id, sub3.id);
    assert.strictEqual(parentItems[1].id, sub1.id);
    assert.strictEqual(parentItems[2].id, bookmark.id);
    assert.strictEqual(parentItems[3].id, sub2.id);
    
    // Verify final normalized orders
    for (let i = 0; i < parentItems.length; i++) {
      assert.strictEqual(parentItems[i].order, i, `Item ${i} should have order ${i}`);
    }
  });

  test('Moving items to folder always places them at the end', async function () {
    this.timeout(10000);
    
    const folder = await bookmarkService.addFolder('Folder');
    
    // Add some bookmarks to folder
    const b1 = await bookmarkService.addBookmark(testFileUri.toString(), 0, 'In Folder 1');
    await bookmarkService.moveToFolder(b1.id, folder.id);
    
    const b2 = await bookmarkService.addBookmark(testFileUri.toString(), 1, 'In Folder 2');
    await bookmarkService.moveToFolder(b2.id, folder.id);

    // Delete b1 to create a gap
    await bookmarkService.deleteBookmark(b1.id);

    // Now move a new bookmark to the folder
    const b3 = await bookmarkService.addBookmark(testFileUri.toString(), 2, 'New to Folder');
    await bookmarkService.moveToFolder(b3.id, folder.id);

    const folderItems = bookmarkService.getBookmarks()
      .filter((b: any) => b.parentId === folder.id)
      .sort((a: any, b: any) => a.order - b.order);

    assert.strictEqual(folderItems.length, 2);
    assert.strictEqual(folderItems[0].id, b2.id, 'Original bookmark should be first');
    assert.strictEqual(folderItems[1].id, b3.id, 'New bookmark should be last');
    
    // b3 should have order greater than b2
    assert.ok(folderItems[1].order > folderItems[0].order, 
      'New bookmark should have higher order than existing');
  });
});
