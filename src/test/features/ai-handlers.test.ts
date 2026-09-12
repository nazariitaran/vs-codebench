import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BookmarksProvider } from '../../features/bookmarks/BookmarksProvider';
import { ScratchpadsProvider } from '../../features/scratchpads/ScratchpadsProvider';
import { addBookmark, getBookmarks, removeBookmark } from '../../features/ai/bookmarkHandlers';
import { createScratchpad, getScratchpadContent, getScratchpads } from '../../features/ai/scratchpadHandlers';
import { createMockExtensionContext } from '../testUtils';

suite('AI tool handlers', () => {
  let mockContext: vscode.ExtensionContext;

  setup(() => {
    mockContext = createMockExtensionContext();
  });

  teardown(() => {
    const tempRoot = path.dirname(mockContext.globalStorageUri.fsPath);
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  suite('bookmarks', () => {
    let bookmarksProvider: BookmarksProvider;

    setup(() => {
      bookmarksProvider = new BookmarksProvider(mockContext);
    });

    teardown(() => {
      bookmarksProvider.dispose();
    });

    test('adds and lists a bookmark', async () => {
      const fileUri = vscode.Uri.file(path.join(mockContext.globalStorageUri.fsPath, 'note.ts')).toString();
      const created = await addBookmark(bookmarksProvider, { fileUri, line: 0, text: 'Entry point' });
      assert.strictEqual(created.success, true);
      assert.ok(created.bookmark?.id);

      const listed = await getBookmarks(bookmarksProvider, { fileUri });
      assert.strictEqual(listed.count, 1);
      assert.strictEqual(listed.bookmarks[0].text, 'Entry point');

      await removeBookmark(bookmarksProvider, { bookmarkId: created.bookmark!.id });
      assert.strictEqual((await getBookmarks(bookmarksProvider, { fileUri })).count, 0);
    });
  });

  suite('scratchpads', () => {
    let scratchpadsProvider: ScratchpadsProvider;

    setup(async () => {
      scratchpadsProvider = new ScratchpadsProvider(mockContext);
      await scratchpadsProvider.whenReady();
    });

    teardown(() => {
      scratchpadsProvider.dispose();
    });

    test('creates a scratchpad and reads its content', async () => {
      await createScratchpad(scratchpadsProvider, {
        name: 'agent-notes.md',
        language: 'markdown',
        content: '# notes'
      });

      const listed = await getScratchpads(scratchpadsProvider, { includeAll: true });
      assert.strictEqual(listed.count, 1);
      const scratchpadId = listed.scratchpads[0].id;

      const content = await getScratchpadContent(scratchpadsProvider, { scratchpadId });
      assert.strictEqual(content.scratchpad.content, '# notes');
    });
  });
});
