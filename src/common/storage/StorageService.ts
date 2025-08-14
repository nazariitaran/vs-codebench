import * as vscode from 'vscode';

// Key naming convention constants
const KEY_SEPARATOR = '::';
const GLOBAL_USER_IDENTIFIER = '<user>';

export type StorageScope = 'workspace' | 'global' | 'auto';

export interface StorageOptions {
  scope?: StorageScope;
}

/**
 * A reusable storage service for VS Code extensions that handles
 * workspace-specific and global storage with automatic fallback.
 */
export class StorageService {
  constructor(private context: vscode.ExtensionContext) {}

  /**
     * Store data with automatic scope detection
     */
  async store<T>(key: string, value: T, options: StorageOptions = {}): Promise<void> {
    const scope = options.scope || 'auto';
    const storage = this.getStorage(scope);

    if (storage) {
      await storage.update(key, value);
    } else {
      // Fallback to global if no workspace available
      await this.context.globalState.update(key, value);
    }
  }

  /**
     * Retrieve data with automatic scope detection
     */
  async retrieve<T>(key: string, defaultValue: T, options: StorageOptions = {}): Promise<T> {
    const scope = options.scope || 'auto';
    const storage = this.getStorage(scope);

    if (storage) {
      const value = storage.get<T>(key);
      if (value !== undefined) {
        return value;
      }
    }

    // In 'auto' scope, do NOT fall back to global when a workspace is open.
    // If a workspace is open and the key is missing, return the default value.
    // If no workspace is open, getStorage('auto') already points to globalState.
    return defaultValue;
  }

  /**
     * Delete data from storage
     */
  async delete(key: string, options: StorageOptions = {}): Promise<void> {
    const scope = options.scope || 'auto';
    const storage = this.getStorage(scope);

    if (storage) {
      await storage.update(key, undefined);
    } else {
      // Fallback to global if no workspace available
      await this.context.globalState.update(key, undefined);
    }

    // Also delete from global if in auto mode and we used workspace storage
    if (scope === 'auto' && vscode.workspace.workspaceFolders) {
      await this.context.globalState.update(key, undefined);
    }
  }

  /**
     * Clear all data for a given scope
     */
  async clear(scope: StorageScope = 'auto'): Promise<void> {
    const storage = this.getStorage(scope);
    if (storage) {
      // Note: This will clear ALL data in the storage scope
      // VS Code doesn't provide a way to enumerate keys, so we clear everything
      const keys = storage.keys();
      for (const key of keys) {
        await storage.update(key, undefined);
      }
    }
  }

  /**
     * Get all keys for a given scope
     */
  async keys(scope: StorageScope = 'auto'): Promise<string[]> {
    const storage = this.getStorage(scope);
    if (!storage) {
      return [];
    }

    return [...storage.keys()];
  }

  /**
     * Check if a key exists
     */
  async has(key: string, options: StorageOptions = {}): Promise<boolean> {
    const value = await this.retrieve(key, undefined, options);
    return value !== undefined;
  }

  private getStorage(scope: StorageScope): vscode.Memento | undefined {
    switch (scope) {
      case 'workspace':
        return vscode.workspace.workspaceFolders ? this.context.workspaceState : undefined;
      case 'global':
        return this.context.globalState;
      case 'auto':
        return vscode.workspace.workspaceFolders ? this.context.workspaceState : this.context.globalState;
    }
  }


}

/**
 * Options for creating storage keys
 */
export interface KeyOptions {
  /**
   * The feature name (e.g., 'todos', 'bookmarks', 'scratchpads')
   */
  featureName: string;
  
  /**
   * The sub-key within the feature (e.g., 'items', 'settings', 'data')
   */
  subKey: string;
  
  /**
   * Whether this is global user data (true) or workspace-specific data (false)
   * Defaults to workspace-specific if not specified
   */
  isGlobal?: boolean;
}

/**
 * Get a deterministic workspace identifier.
 * Uses workspace folder URI if available, otherwise falls back to workspace name.
 * Returns undefined if no workspace is open.
 */
function getWorkspaceIdentifier(): string | undefined {
  // First, try to get the first workspace folder's URI
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    // Use the first workspace folder's URI as the identifier
    // This is stable and unique across different workspaces
    return vscode.workspace.workspaceFolders[0].uri.toString();
  }
  
  // Fallback to workspace name if available
  if (vscode.workspace.name) {
    return vscode.workspace.name;
  }
  
  // No workspace is open
  return undefined;
}

/**
 * Create a storage key following the naming convention.
 * 
 * @param options Key generation options
 * @returns A properly formatted storage key
 * 
 * @example
 * // Workspace-specific key
 * createStorageKey({ featureName: 'todos', subKey: 'items' })
 * // Returns: "todos::file:///path/to/workspace::items"
 * 
 * @example
 * // Global user key
 * createStorageKey({ featureName: 'todos', subKey: 'settings', isGlobal: true })
 * // Returns: "todos::<user>::settings"
 */
function createStorageKey(options: KeyOptions): string {
  const { featureName, subKey, isGlobal = false } = options;
  
  // Validate inputs
  if (!featureName || !subKey) {
    throw new Error('Both featureName and subKey are required');
  }
  
  // Don't allow the separator in feature names or sub-keys to prevent parsing issues
  if (featureName.includes(KEY_SEPARATOR) || subKey.includes(KEY_SEPARATOR)) {
    throw new Error(`Feature name and sub-key cannot contain '${KEY_SEPARATOR}'`);
  }
  
  if (isGlobal) {
    // Global key format: featureName::<user>::subKey
    return `${featureName}${KEY_SEPARATOR}${GLOBAL_USER_IDENTIFIER}${KEY_SEPARATOR}${subKey}`;
  } else {
    // Workspace key format: featureName::<workspaceUri>::subKey
    const workspaceId = getWorkspaceIdentifier();
    
    if (!workspaceId) {
      // No workspace open - fallback to global key
      console.warn('No workspace open, falling back to global key');
      return createStorageKey({ ...options, isGlobal: true });
    }
    
    return `${featureName}${KEY_SEPARATOR}${workspaceId}${KEY_SEPARATOR}${subKey}`;
  }
}

/**
 * Create a key builder for a specific feature.
 * This is useful when a feature needs to create multiple keys.
 * 
 * @param featureName The name of the feature
 * @returns A function that creates keys for that feature
 * 
 * @example
 * const todoKeys = createKeyBuilder('todos');
 * const itemsKey = todoKeys('items'); // workspace-specific
 * const settingsKey = todoKeys('settings', true); // global
 */
function createKeyBuilder(featureName: string) {
  return (subKey: string, isGlobal = false): string => {
    return createStorageKey({ featureName, subKey, isGlobal });
  };
}

/**
 * Factory function to create storage service with namespace support
 */
export function createNamespacedStorage(
  context: vscode.ExtensionContext,
  namespace: string
): NamespacedStorageService {
  return new NamespacedStorageService(context, namespace);
}

/**
 * A namespaced version of the storage service to avoid key collisions
 * Uses the new key naming convention for deterministic, collision-free keys
 */
export class NamespacedStorageService extends StorageService {
  private keyBuilder: ReturnType<typeof createKeyBuilder>;
  
  constructor(
    context: vscode.ExtensionContext,
    private namespace: string
  ) {
    super(context);
    this.keyBuilder = createKeyBuilder(namespace);
  }

  /**
   * Store with proper handling of 'auto' scope: write to workspace if available, otherwise global.
   */
  async store<T>(key: string, value: T, options?: StorageOptions): Promise<void> {
    const scope = options?.scope ?? 'auto';
    if (scope === 'auto') {
      if (vscode.workspace.workspaceFolders) {
        const wsKey = this.buildKey(key, false);
        return super.store(wsKey, value, { scope: 'workspace' });
      } else {
        const gKey = this.buildKey(key, true);
        return super.store(gKey, value, { scope: 'global' });
      }
    }

    const namespacedKey = this.buildKey(key, scope === 'global');
    return super.store(namespacedKey, value, options);
  }

  /**
   * Retrieve in 'auto' mode without leaking global data into workspaces:
   * - If a workspace is open: read only from workspace; if missing, return default.
   * - If no workspace is open: read from global.
   */
  async retrieve<T>(key: string, defaultValue: T, options?: StorageOptions): Promise<T> {
    const scope = options?.scope ?? 'auto';
    if (scope === 'auto') {
      if (vscode.workspace.workspaceFolders) {
        const wsKey = this.buildKey(key, false);
        const wsValue = await super.retrieve<T | undefined>(wsKey, undefined as any, { scope: 'workspace' });
        if (wsValue !== undefined) {
          return wsValue as T;
        }
        return defaultValue;
      }
      const gKey = this.buildKey(key, true);
      const gValue = await super.retrieve<T | undefined>(gKey, undefined as any, { scope: 'global' });
      if (gValue !== undefined) {
        return gValue as T;
      }
      return defaultValue;
    }

    const namespacedKey = this.buildKey(key, scope === 'global');
    return super.retrieve(namespacedKey, defaultValue, options);
  }

  /**
   * Delete with dual-delete when in 'auto' mode to ensure both scopes are cleared.
   */
  async delete(key: string, options?: StorageOptions): Promise<void> {
    const scope = options?.scope ?? 'auto';
    if (scope === 'auto') {
      const tasks: Promise<void>[] = [];
      if (vscode.workspace.workspaceFolders) {
        const wsKey = this.buildKey(key, false);
        tasks.push(super.delete(wsKey, { scope: 'workspace' }));
      }
      const gKey = this.buildKey(key, true);
      tasks.push(super.delete(gKey, { scope: 'global' }));
      await Promise.all(tasks);
      return;
    }

    const namespacedKey = this.buildKey(key, scope === 'global');
    return super.delete(namespacedKey, options);
  }

  /**
   * Has in 'auto' mode without leaking global data into workspaces.
   */
  async has(key: string, options?: StorageOptions): Promise<boolean> {
    const scope = options?.scope ?? 'auto';
    if (scope === 'auto') {
      if (vscode.workspace.workspaceFolders) {
        const wsKey = this.buildKey(key, false);
        return super.has(wsKey, { scope: 'workspace' });
      }
      const gKey = this.buildKey(key, true);
      return super.has(gKey, { scope: 'global' });
    }

    const namespacedKey = this.buildKey(key, scope === 'global');
    return super.has(namespacedKey, options);
  }

  /**
   * Build a namespaced key explicitly as global or workspace key.
   */
  private buildKey(subKey: string, isGlobal: boolean): string {
    return this.keyBuilder(subKey, isGlobal);
  }
}
