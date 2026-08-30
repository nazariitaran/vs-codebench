import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BookmarksProvider } from '../../features/bookmarks/BookmarksProvider';
import { ScratchpadsProvider } from '../../features/scratchpads/ScratchpadsProvider';
import { TodosProvider } from '../../features/todos/TodosProvider';
import { addBookmark, getBookmarks, removeBookmark } from '../../features/ai/bookmarkHandlers';
import { createScratchpad, getScratchpadContent, getScratchpads } from '../../features/ai/scratchpadHandlers';
import { addTodo, getTodos, removeTodo, toggleTodo } from '../../features/ai/todoHandlers';
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

  suite('todos', () => {
    let todosProvider: TodosProvider;

    setup(() => {
      todosProvider = new TodosProvider(mockContext);
    });

    teardown(() => {
      todosProvider.dispose();
    });

    test('adds, lists, toggles, and removes a todo', async () => {
      const created = await addTodo(todosProvider, { text: 'Ship Cursor support' });
      assert.strictEqual(created.success, true);
      assert.ok(created.todo?.id);

      const listed = await getTodos(todosProvider);
      assert.strictEqual(listed.count, 1);
      assert.strictEqual(listed.stats.total, 1);
      assert.strictEqual(listed.todos[0].done, false);

      const toggled = await toggleTodo(todosProvider, { todoId: created.todo!.id });
      assert.strictEqual(toggled.todo.done, true);

      const removed = await removeTodo(todosProvider, { todoId: created.todo!.id });
      assert.strictEqual(removed.deletedTodoId, created.todo!.id);
      assert.strictEqual((await getTodos(todosProvider)).count, 0);
    });

    test('rejects empty todo text', async () => {
      await assert.rejects(
        () => addTodo(todosProvider, { text: '   ' }),
        /Text must be between 1 and 75 characters/
      );
    });
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
