import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Creates a comprehensive mock VS Code extension context for testing
 * @param withWorkspaceFolders If true, mock workspace folders will be present
 */
export function createMockExtensionContext(withWorkspaceFolders = false): vscode.ExtensionContext {
  // Create storage maps for testing
  const globalStorage = new Map<string, any>();
  const workspaceStorage = new Map<string, any>();

  // Create a fixed temporary storage root for testing; per-test cleanup will remove it
  const tempDir = path.join(process.cwd(), '.test-temp');
  const globalStorageDir = path.join(tempDir, 'global-storage');
  const workspaceStorageDir = path.join(tempDir, 'workspace-storage');
  const logDir = path.join(tempDir, 'log');

  // Ensure temp directories exist
  [tempDir, globalStorageDir, workspaceStorageDir, logDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Optionally mock workspace folders
  if (withWorkspaceFolders) {
    if (!(global as any).vscode) { (global as any).vscode = {}; }
    (global as any).vscode.workspace = {
      ...((global as any).vscode.workspace),
      workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }]
    };
  } else {
    if (!(global as any).vscode) { (global as any).vscode = {}; }
    (global as any).vscode.workspace = {
      ...((global as any).vscode.workspace),
      workspaceFolders: undefined
    };
  }

  return {
    subscriptions: [],
    extensionPath: '/mock/extension/path',
    extensionUri: vscode.Uri.file('/mock/extension/path'),
    globalState: {
      get: (key: string, defaultValue?: any) => globalStorage.get(key) ?? defaultValue,
      update: (key: string, value: any) => {
        if (value === undefined) {
          globalStorage.delete(key);
        } else {
          globalStorage.set(key, value);
        }
        return Promise.resolve();
      },
      keys: () => Array.from(globalStorage.keys())
    },
    workspaceState: {
      get: (key: string, defaultValue?: any) => workspaceStorage.get(key) ?? defaultValue,
      update: (key: string, value: any) => {
        if (value === undefined) {
          workspaceStorage.delete(key);
        } else {
          workspaceStorage.set(key, value);
        }
        return Promise.resolve();
      },
      keys: () => Array.from(workspaceStorage.keys())
    },
    environmentVariableCollection: {
      persistent: true,
      replace: () => { },
      append: () => { },
      prepend: () => { },
      get: () => undefined,
      forEach: () => { },
      delete: () => { },
      clear: () => { },
      description: undefined
    },
    storageUri: vscode.Uri.file(workspaceStorageDir),
    globalStorageUri: vscode.Uri.file(globalStorageDir),
    logUri: vscode.Uri.file(logDir),
    extensionMode: vscode.ExtensionMode.Test,
    secrets: {
      get: () => Promise.resolve(undefined),
      store: () => Promise.resolve(),
      delete: () => Promise.resolve()
    }
  } as any;
}

/**
 * Creates a simple tree data provider for testing
 */
export class MockTreeDataProvider implements vscode.TreeDataProvider<string> {
  private _items: string[];

  constructor(items: string[]) {
    this._items = items;
  }

  getTreeItem(element: string): vscode.TreeItem {
    const item = new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
    item.id = element;
    return item;
  }

  getChildren(element?: string): string[] {
    if (!element) {
      return this._items;
    }
    return [];
  }
}

/**
 * Asserts that a mock context has all required properties
 */
export function assertValidMockContext(mockContext: vscode.ExtensionContext): void {
  const assert = require('assert');

  assert.ok(mockContext.globalState, 'Context should have globalState');
  assert.ok(mockContext.workspaceState, 'Context should have workspaceState');
  assert.ok(mockContext.subscriptions, 'Context should have subscriptions array');
  assert.ok(mockContext.extensionPath, 'Context should have extensionPath');
  assert.ok(mockContext.storageUri, 'Context should have storageUri');
  assert.ok(mockContext.extensionUri, 'Context should have extensionUri');
}
