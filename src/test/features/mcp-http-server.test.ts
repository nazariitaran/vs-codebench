import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CodebenchMcpHttpServer } from '../../features/ai/mcpHttpServer';
import { canRegisterLanguageModelTools, createToolCatalog } from '../../features/ai';
import { BookmarksProvider } from '../../features/bookmarks/BookmarksProvider';
import { ScratchpadsProvider } from '../../features/scratchpads/ScratchpadsProvider';
import { TodosProvider } from '../../features/todos/TodosProvider';
import { createMockExtensionContext } from '../testUtils';

suite('Language model tools guard', () => {
  test('returns false when the language model API is missing', () => {
    assert.strictEqual(canRegisterLanguageModelTools(undefined), false);
    assert.strictEqual(canRegisterLanguageModelTools({}), false);
  });

  test('returns true when registerTool is a function', () => {
    assert.strictEqual(canRegisterLanguageModelTools({
      registerTool: () => ({ dispose() { } })
    }), true);
  });
});

suite('Codebench MCP HTTP server', () => {
  let mockContext: vscode.ExtensionContext;
  let todosProvider: TodosProvider;
  let bookmarksProvider: BookmarksProvider;
  let scratchpadsProvider: ScratchpadsProvider;
  let server: CodebenchMcpHttpServer;
  let url: string;
  let token: string;

  setup(async function () {
    this.timeout(30000);
    mockContext = createMockExtensionContext();
    todosProvider = new TodosProvider(mockContext);
    bookmarksProvider = new BookmarksProvider(mockContext);
    scratchpadsProvider = new ScratchpadsProvider(mockContext);
    await scratchpadsProvider.whenReady();

    server = new CodebenchMcpHttpServer(
      createToolCatalog({ todosProvider, bookmarksProvider, scratchpadsProvider }),
      '1.3.0'
    );
    const started = await server.start();
    url = started.url;
    token = started.token;
  });

  teardown(async () => {
    await server.dispose();
    todosProvider.dispose();
    bookmarksProvider.dispose();
    scratchpadsProvider.dispose();
    const tempRoot = path.dirname(mockContext.globalStorageUri.fsPath);
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function rpc(method: string, params?: unknown, id: number | null = 1, auth = true) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (auth) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      })
    });

    return {
      status: response.status,
      body: await response.json() as any
    };
  }

  test('rejects requests without the bearer token', async () => {
    const result = await rpc('initialize', {}, 1, false);
    assert.strictEqual(result.status, 401);
  });

  test('initializes and lists codebench tools', async function () {
    this.timeout(20000);

    const initialized = await rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'codebench-test', version: '0.0.0' }
    });
    assert.strictEqual(initialized.status, 200);
    assert.strictEqual(initialized.body.result.serverInfo.name, 'vs-codebench');
    assert.ok(initialized.body.result.capabilities.tools);

    const listed = await rpc('tools/list');
    assert.strictEqual(listed.status, 200);
    const names = listed.body.result.tools.map((tool: { name: string }) => tool.name);
    assert.ok(names.includes('codebench_get_todos'));
    assert.ok(names.includes('codebench_get_bookmarks'));
    assert.ok(names.includes('codebench_get_scratchpads'));
  });

  test('calls todo tools against live provider state', async function () {
    this.timeout(20000);

    const created = await rpc('tools/call', {
      name: 'codebench_add_todo',
      arguments: { text: 'MCP todo' }
    });
    assert.strictEqual(created.body.result.isError, false);
    const createdPayload = JSON.parse(created.body.result.content[0].text);
    assert.ok(createdPayload.todo.id);

    const listed = await rpc('tools/call', {
      name: 'codebench_get_todos',
      arguments: {}
    });
    const listedPayload = JSON.parse(listed.body.result.content[0].text);
    assert.strictEqual(listedPayload.count, 1);
    assert.strictEqual(listedPayload.todos[0].text, 'MCP todo');
  });

  test('returns isError for unknown tool names', async () => {
    const result = await rpc('tools/call', {
      name: 'codebench_does_not_exist',
      arguments: {}
    });
    assert.strictEqual(result.body.result.isError, true);
  });
});
