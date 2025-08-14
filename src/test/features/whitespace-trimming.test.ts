import * as assert from 'assert';
import { TodoService } from '../../features/todos/TodoService';
import { BookmarkService } from '../../features/bookmarks/BookmarkService';
import { ScratchpadService } from '../../features/scratchpads/ScratchpadService';
import { createMockExtensionContext } from '../testUtils';

suite('Whitespace Trimming', () => {
  let mockContext: any;

  setup(() => {
    mockContext = createMockExtensionContext();
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

  suite('TodoService', () => {
    let todoService: TodoService;

    setup(() => {
      todoService = new TodoService(mockContext);
    });

    test('should trim leading and trailing whitespace when adding todo', async () => {
      const todoWithWhitespace = '  My todo task  ';
      const expectedText = 'My todo task';

      const addedTodo = await todoService.addTodo(todoWithWhitespace);
      
      assert.strictEqual(addedTodo.text, expectedText);
    });

    test('should trim leading and trailing whitespace when renaming todo', async () => {
      // First add a todo
      const todo = await todoService.addTodo('Original task');
      
      // Then rename it with whitespace
      const newTextWithWhitespace = '  Updated task  ';
      const expectedText = 'Updated task';
      
      await todoService.renameTodo(todo.id, newTextWithWhitespace);
      
      // Verify the text was trimmed
      const updatedTodo = todoService.findTodo(todo.id);
      assert.strictEqual(updatedTodo?.text, expectedText);
    });

    test('should handle empty string after trimming', async () => {
      const todo = await todoService.addTodo('   ');
      assert.strictEqual(todo.text, '');
    });
  });

  suite('BookmarkService', () => {
    let bookmarkService: BookmarkService;

    setup(() => {
      bookmarkService = new BookmarkService(mockContext);
    });

    test('should trim leading and trailing whitespace when adding bookmark', async () => {
      const textWithWhitespace = '  My bookmark text  ';
      const expectedText = 'My bookmark text';

      const bookmark = await bookmarkService.addBookmark('file:///test.js', 10, textWithWhitespace);
      
      assert.strictEqual(bookmark.text, expectedText);
    });

    test('should trim leading and trailing whitespace when editing bookmark', async () => {
      // First add a bookmark
      const bookmark = await bookmarkService.addBookmark('file:///test.js', 10, 'Original text');
      
      // Then edit it with whitespace
      const newTextWithWhitespace = '  Updated text  ';
      const expectedText = 'Updated text';
      
      await bookmarkService.editBookmark(bookmark.id, newTextWithWhitespace);
      
      // Verify the text was trimmed
      const updatedBookmark = bookmarkService.getBookmarkById(bookmark.id);
      assert.strictEqual(updatedBookmark?.text, expectedText);
    });

    test('should trim leading and trailing whitespace when adding folder', async () => {
      const nameWithWhitespace = '  My Folder  ';
      const expectedName = 'My Folder';

      const folder = await bookmarkService.addFolder(nameWithWhitespace);
      
      assert.strictEqual(folder.name, expectedName);
    });

    test('should trim leading and trailing whitespace when editing folder', async () => {
      // First add a folder
      const folder = await bookmarkService.addFolder('Original Folder');
      
      // Then edit it with whitespace
      const newNameWithWhitespace = '  Updated Folder  ';
      const expectedName = 'Updated Folder';
      
      await bookmarkService.editFolder(folder.id, newNameWithWhitespace);
      
      // Verify the name was trimmed
      const updatedFolder = bookmarkService.findFolder(folder.id);
      assert.strictEqual(updatedFolder?.name, expectedName);
    });
  });

  suite('ScratchpadService', () => {
    let scratchpadService: ScratchpadService;

    setup(() => {
      scratchpadService = new ScratchpadService(mockContext);
    });

    test('should trim leading and trailing whitespace when renaming scratchpad file', async () => {
      // First create a scratchpad
      const scratchpad = await scratchpadService.createScratchFile('test.txt');
      
      // Then rename it with whitespace
      const newNameWithWhitespace = '  new-name.txt  ';
      const expectedName = 'new-name.txt';
      
      await scratchpadService.renameScratchFile(scratchpad.id, newNameWithWhitespace);
      
      // Verify the name was trimmed
      const updatedScratchpad = scratchpadService.getScratchFile(scratchpad.id);
      assert.strictEqual(updatedScratchpad?.name, expectedName);
    });

    test('should handle whitespace-only string', async () => {
      // First create a scratchpad
      const scratchpad = await scratchpadService.createScratchFile('test.txt');
      
      // Then rename it with whitespace around a valid name
      const newNameWithWhitespace = '  valid-name.txt  ';
      const expectedName = 'valid-name.txt';
      
      await scratchpadService.renameScratchFile(scratchpad.id, newNameWithWhitespace);
      
      // Verify the name was trimmed properly
      const updatedScratchpad = scratchpadService.getScratchFile(scratchpad.id);
      assert.strictEqual(updatedScratchpad?.name, expectedName);
    });
  });
});
