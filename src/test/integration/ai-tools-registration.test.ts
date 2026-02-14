import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('AI tools registration', () => {
  let extension: vscode.Extension<any>;
  let workspaceFolder: string;

  suiteSetup(async function () {
    this.timeout(30000);
    extension = vscode.extensions.getExtension('nazariitaran.vs-codebench')!;
    assert.ok(extension, 'Extension should be found');
    if (!extension.isActive) {
      await extension.activate();
    }
    assert.ok(extension.isActive, 'Extension should be active');

    workspaceFolder = path.join(process.cwd(), '.test-workspace-ai-tools');
    if (!fs.existsSync(workspaceFolder)) {
      fs.mkdirSync(workspaceFolder, { recursive: true });
    }
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    if (fs.existsSync(workspaceFolder)) {
      fs.rmSync(workspaceFolder, { recursive: true, force: true });
    }
  });

  test('registers all VS CodeBench language model tools', async function () {
    this.timeout(20000);

    const expectedTools = [
      'codebench_get_bookmarks',
      'codebench_add_bookmark',
      'codebench_move_bookmark_to_folder',
      'codebench_rename_bookmark',
      'codebench_set_bookmark_color',
      'codebench_remove_bookmark',
      'codebench_create_bookmark_folder',
      'codebench_remove_bookmark_folder',
      'codebench_get_scratchpads',
      'codebench_get_scratchpad_content',
      'codebench_create_scratchpad',
      'codebench_rename_scratchpad',
      'codebench_delete_scratchpad'
    ];

    const registeredToolNames = new Set(vscode.lm.tools.map(tool => tool.name));

    for (const expectedTool of expectedTools) {
      assert.ok(
        registeredToolNames.has(expectedTool),
        `Expected language model tool to be registered: ${expectedTool}`
      );
    }
  });

  test('invokes get bookmarks tool and returns structured data', async function () {
    this.timeout(20000);

    const { bookmarksProvider } = extension.exports as any;
    assert.ok(bookmarksProvider, 'bookmarksProvider should be available');

    const filePath = path.join(workspaceFolder, 'tool-smoke.js');
    fs.writeFileSync(filePath, 'const value = 42;\n', 'utf8');
    const fileUri = vscode.Uri.file(filePath);
    const bookmarkText = 'AI Tool Smoke Bookmark';

    const existingAtLine = bookmarksProvider.getBookmarkForLine(fileUri.toString(), 0);
    if (!existingAtLine) {
      await bookmarksProvider.addBookmark(fileUri.toString(), 0, bookmarkText);
    }

    const result = await vscode.lm.invokeTool('codebench_get_bookmarks', {
      input: { fileUri: fileUri.toString() },
      toolInvocationToken: undefined
    });

    const textPart = result.content.find(part => part instanceof vscode.LanguageModelTextPart) as vscode.LanguageModelTextPart | undefined;
    assert.ok(textPart, 'Tool result should include a text part');

    const payload = JSON.parse(textPart.value);
    assert.ok(typeof payload.count === 'number', 'Payload should include numeric count');
    assert.ok(Array.isArray(payload.bookmarks), 'Payload should include bookmarks array');
    assert.ok(
      payload.bookmarks.some((bookmark: any) => bookmark.fileUri === fileUri.toString()),
      'Payload should include bookmarks for the target file'
    );
  });
});
