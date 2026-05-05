import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { ScratchFile, ScratchpadFolder, ScratchpadData, CURRENT_SCRATCHPAD_VERSION } from './Models';
import { NamespacedStorageService, createNamespacedStorage } from '../../common/storage/StorageService';

export class ScratchpadService {
  private scratchFiles: Map<string, ScratchFile> = new Map();
  private folders: ScratchpadFolder[] = [];
  private storage: NamespacedStorageService;

  constructor(private context: vscode.ExtensionContext) {
    this.storage = createNamespacedStorage(context, 'scratchpads');
    // Kick off async creation; no need to block activation
    void this.ensureStorageExists();
  }

  private async ensureStorageExists(): Promise<void> {
    try {
      const dir = this.scratchpadDirectory;
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
    }
  }

  private get scratchpadDirectory(): string {
    // Use workspace storage if available, otherwise use global storage
    const storageUri = (vscode.workspace.workspaceFolders?.length && this.context.storageUri)
      ? this.context.storageUri
      : this.context.globalStorageUri;
    return path.join(storageUri.fsPath, 'scratchpads');
  }

  async loadScratchFiles(): Promise<void> {
    try {
      const data = await this.storage.retrieve<ScratchpadData>('metadata', {
        version: CURRENT_SCRATCHPAD_VERSION,
        files: [],
        folders: []
      }, { scope: 'auto' });

      this.scratchFiles.clear();
      this.folders = [];

      // v1→v2 migration: initialize parentId on existing files
      if (data.version < 2) {
        data.files.forEach(file => {
          const migrated: ScratchFile = { ...file, parentId: undefined };
          this.scratchFiles.set(file.id, migrated);
        });
      } else {
        data.files.forEach(file => {
          this.scratchFiles.set(file.id, file);
        });
        this.folders = data.folders || [];
      }
    } catch (error) {
      console.error('Failed to load scratch files:', error);
    }
  }

  async saveMetadata(): Promise<void> {
    try {
      const data: ScratchpadData = {
        version: CURRENT_SCRATCHPAD_VERSION,
        files: Array.from(this.scratchFiles.values()),
        folders: this.folders
      };
      await this.storage.store('metadata', data, { scope: 'auto' });
    } catch (error) {
      console.error('Failed to save metadata:', error);
    }
  }

  // ─── Folder CRUD ─────────────────────────────────────────────────────────────

  getFolders(): ScratchpadFolder[] {
    return this.folders;
  }

  getFolderById(id: string): ScratchpadFolder | undefined {
    return this.folders.find(f => f.id === id);
  }

  async addFolder(name: string, parentId?: string): Promise<ScratchpadFolder> {
    const siblings = this.getFolderSiblings(parentId);
    const orders = siblings.map(s => s.order).filter((o): o is number => o !== undefined);
    const maxOrder = orders.length > 0 ? Math.max(...orders) : -1;

    const newFolder: ScratchpadFolder = {
      id: uuidv4(),
      name: name.trim(),
      parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: maxOrder + 1,
      isExpanded: true
    };

    this.folders.push(newFolder);
    await this.saveMetadata();
    return newFolder;
  }

  async editFolder(id: string, name: string): Promise<void> {
    const folder = this.folders.find(f => f.id === id);
    if (folder) {
      folder.name = name.trim();
      folder.updatedAt = Date.now();
      await this.saveMetadata();
    }
  }

  async deleteFolder(id: string): Promise<void> {
    const folder = this.folders.find(f => f.id === id);
    if (!folder) {
      return;
    }

    const parentId = folder.parentId;
    this.deleteFolderRecursive(id);

    // Normalize order after deletion
    const siblings = this.getFolderSiblings(parentId);
    siblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    siblings.forEach((item, index) => { item.order = index; });

    await this.saveMetadata();
  }

  private deleteFolderRecursive(folderId: string): void {
    // Move all files in this folder to root (parentId = undefined)
    this.scratchFiles.forEach(file => {
      if (file.parentId === folderId) {
        file.parentId = undefined;
      }
    });

    // Recursively delete subfolders
    const subfolders = this.folders.filter(f => f.parentId === folderId);
    for (const subfolder of subfolders) {
      this.deleteFolderRecursive(subfolder.id);
    }

    // Delete the folder itself
    this.folders = this.folders.filter(f => f.id !== folderId);
  }

  async moveToFolder(itemId: string, targetFolderId?: string): Promise<void> {
    // Moving a scratchpad file
    const file = this.scratchFiles.get(itemId);
    if (file) {
      const sourceParentId = file.parentId;

      const targetSiblings = this.getFolderSiblings(targetFolderId);
      const targetOrders = targetSiblings.map(s => s.order).filter((o): o is number => o !== undefined);
      const maxOrder = targetOrders.length > 0 ? Math.max(...targetOrders) : -1;

      file.parentId = targetFolderId;
      file.lastModified = Date.now();
      file.order = maxOrder + 1;

      if (sourceParentId !== targetFolderId) {
        const sourceSiblings = this.getFolderSiblings(sourceParentId);
        sourceSiblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        sourceSiblings.forEach((item, index) => { item.order = index; });
      }

      await this.saveMetadata();
      return;
    }

    // Moving a folder
    const folder = this.folders.find(f => f.id === itemId);
    if (folder) {
      if (targetFolderId && this.isDescendantOf(targetFolderId, itemId)) {
        throw new Error('Cannot move folder into itself or its subfolders');
      }

      if (targetFolderId) {
        const targetDepth = this.getFolderDepth(targetFolderId);
        const folderDepth = this.getMaxFolderDepth(itemId);
        if (targetDepth + folderDepth > 5) {
          throw new Error('Moving this folder would exceed maximum depth (5 levels)');
        }
      }

      const sourceParentId = folder.parentId;

      const targetSiblings = this.getFolderSiblings(targetFolderId);
      const targetOrders = targetSiblings.map(s => s.order).filter((o): o is number => o !== undefined);
      const maxOrder = targetOrders.length > 0 ? Math.max(...targetOrders) : -1;

      folder.parentId = targetFolderId;
      folder.updatedAt = Date.now();
      folder.order = maxOrder + 1;

      if (sourceParentId !== targetFolderId) {
        const sourceSiblings = this.getFolderSiblings(sourceParentId);
        sourceSiblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        sourceSiblings.forEach((item, index) => { item.order = index; });
      }

      await this.saveMetadata();
    }
  }

  getFolderDepth(folderId: string): number {
    let depth = 1;
    let currentId: string | undefined = folderId;

    while (currentId) {
      const folder = this.folders.find(f => f.id === currentId);
      if (folder?.parentId) {
        depth++;
        currentId = folder.parentId;
      } else {
        currentId = undefined;
      }
    }

    return depth;
  }

  private getMaxFolderDepth(folderId: string): number {
    let maxDepth = 1;

    const subfolders = this.folders.filter(f => f.parentId === folderId);
    for (const subfolder of subfolders) {
      const subfolderDepth = this.getMaxFolderDepth(subfolder.id);
      maxDepth = Math.max(maxDepth, subfolderDepth + 1);
    }

    return maxDepth;
  }

  private isDescendantOf(possibleDescendantId: string, ancestorId: string): boolean {
    let currentId: string | undefined = possibleDescendantId;

    while (currentId) {
      if (currentId === ancestorId) {
        return true;
      }
      const folder = this.folders.find(f => f.id === currentId);
      currentId = folder?.parentId;
    }

    return false;
  }

  private getFolderSiblings(parentId?: string): (ScratchpadFolder | ScratchFile)[] {
    const folders = this.folders.filter(f => f.parentId === parentId);
    const files = Array.from(this.scratchFiles.values()).filter(f => f.parentId === parentId);
    return [...folders, ...files];
  }

  countFolderItems(folderId: string): number {
    let count = 0;

    count += Array.from(this.scratchFiles.values()).filter(f => f.parentId === folderId).length;

    const subfolders = this.folders.filter(f => f.parentId === folderId);
    for (const subfolder of subfolders) {
      count += 1;
      count += this.countFolderItems(subfolder.id);
    }

    return count;
  }

  async reorderItem(draggedId: string, targetId: string, dropPosition: 'before' | 'after'): Promise<void> {
    const draggedFile = this.scratchFiles.get(draggedId);
    const draggedFolder = this.folders.find(f => f.id === draggedId);
    if (!draggedFile && !draggedFolder) {
      throw new Error('Dragged item not found');
    }

    const targetFile = this.scratchFiles.get(targetId);
    const targetFolder = this.folders.find(f => f.id === targetId);
    if (!targetFile && !targetFolder) {
      throw new Error('Target item not found');
    }

    const sourceParentId = draggedFile ? draggedFile.parentId : draggedFolder!.parentId;
    const targetParentId = targetFile ? targetFile.parentId : targetFolder!.parentId;

    if (draggedFolder && targetParentId !== undefined && this.isDescendantOf(targetParentId, draggedFolder.id)) {
      throw new Error('Cannot move folder into itself or its subfolders');
    }
    if (draggedFolder && targetParentId !== undefined) {
      const targetDepth = this.getFolderDepth(targetParentId);
      const folderDepth = this.getMaxFolderDepth(draggedFolder.id);
      if (targetDepth + folderDepth > 5) {
        throw new Error('Moving this folder would exceed maximum depth (5 levels)');
      }
    }

    // Build ordered list of target parent's items (WITHOUT removing dragged from collections first)
    // Include ALL items at target parent (target item IS in the list, dragged is EXCLUDED so it can be inserted)
    const targetFolders = this.folders.filter(f => f.parentId === targetParentId && f.id !== draggedId);
    const targetFiles = Array.from(this.scratchFiles.values()).filter(f => f.parentId === targetParentId && f.id !== draggedId);
    const targetItems: Array<ScratchpadFolder | ScratchFile> = [...targetFolders, ...targetFiles]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Find where to insert relative to the target item
    const targetIndex = targetItems.findIndex(item => item.id === targetId);
    const insertIndex = dropPosition === 'after' ? targetIndex + 1 : targetIndex;

    // Insert dragged item at the computed position
    targetItems.splice(insertIndex, 0, draggedFile ? draggedFile : draggedFolder!);

    // Update order and parentId for ALL target-parent items (includes dragged)
    targetItems.forEach((item, index) => {
      const isDraggedFile = item.id === draggedId && draggedFile !== undefined;
      const isDraggedFolder = item.id === draggedId && draggedFolder !== undefined;

      if (isDraggedFile) {
        draggedFile.parentId = targetParentId;
        draggedFile.order = index;
      } else if (isDraggedFolder) {
        draggedFolder.parentId = targetParentId;
        draggedFolder.order = index;
      } else {
        const existingFile = this.scratchFiles.get(item.id);
        if (existingFile) {
          existingFile.order = index;
        } else {
          const existingFolder = this.folders.find(f => f.id === item.id);
          if (existingFolder) {
            existingFolder.order = index;
          }
        }
      }
    });

    // Always update the dragged item's parentId (for cross-parent moves)
    if (draggedFile) {
      draggedFile.parentId = targetParentId;
    } else if (draggedFolder) {
      draggedFolder.parentId = targetParentId;
    }

    // If moving between parents, normalize source parent's remaining items
    if (sourceParentId !== targetParentId) {
      const sourceFolders = this.folders.filter(f => f.id !== draggedId && f.parentId === sourceParentId);
      const sourceFiles = Array.from(this.scratchFiles.values()).filter(f => f.id !== draggedId && f.parentId === sourceParentId);
      const sourceItems: Array<ScratchpadFolder | ScratchFile> = [...sourceFolders, ...sourceFiles]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      sourceItems.forEach((item, index) => {
        const existingFile = this.scratchFiles.get(item.id);
        if (existingFile) {
          existingFile.order = index;
        } else {
          const existingFolder = this.folders.find(f => f.id === item.id);
          if (existingFolder) {
            existingFolder.order = index;
          }
        }
      });
    }

    await this.saveMetadata();
  }

  async clearAll(): Promise<void> {
    for (const file of this.scratchFiles.values()) {
      const filePath = this.getFilePath(file.id);
      try {
        const exists = await fs.promises
          .access(filePath, fs.constants.F_OK)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          await fs.promises.unlink(filePath);
        }
      } catch (error) {
        console.error(`Failed to delete file ${filePath}:`, error);
      }
    }

    this.scratchFiles.clear();
    this.folders = [];
    await this.saveMetadata();
  }

  getScratchFiles(): ScratchFile[] {
    return Array.from(this.scratchFiles.values())
      .sort((a, b) => {
        const ao = a.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) {
          return ao - bo;
        }
        // Fallback to lastModified desc for legacy/no-order entries
        return b.lastModified - a.lastModified;
      });
  }

  getScratchFile(id: string): ScratchFile | undefined {
    return this.scratchFiles.get(id);
  }

  getFilePath(id: string): string {
    const file = this.scratchFiles.get(id);
    if (file) {
      return path.join(this.scratchpadDirectory, file.name);
    }
    // Fallback for files not yet in memory
    return path.join(this.scratchpadDirectory, `${id}.txt`);
  }

  async createScratchFile(fileName: string, language?: string): Promise<ScratchFile> {
    const id = uuidv4();

    const scratchFile: ScratchFile = {
      id,
      name: fileName,
      content: '',
      language,
      createdAt: Date.now(),
      lastModified: Date.now(),
      order: this.getNextOrderIndex()
    };

    this.scratchFiles.set(id, scratchFile);
    await this.saveFileContent(id, '');
    await this.saveMetadata();

    return scratchFile;
  }

  async updateFileContent(id: string, content: string): Promise<void> {
    const file = this.scratchFiles.get(id);
    if (file) {
      file.content = content;
      file.lastModified = Date.now();
      await this.saveFileContent(id, content);
      await this.saveMetadata();
    }
  }

  async renameScratchFile(id: string, newName: string): Promise<void> {
    const file = this.scratchFiles.get(id);
    if (!file) {
      return;
    }

    const trimmed = (newName ?? '').trim();

    const providedExt = path.extname(trimmed);
    const oldExt = path.extname(file.name);
    const targetName = providedExt ? trimmed : `${trimmed}${oldExt}`;

    // If name did not change, nothing to do
    if (targetName === file.name) {
      return;
    }

    const oldPath = this.getFilePath(id);
    file.name = targetName;
    file.lastModified = Date.now();
    const newPath = this.getFilePath(id);

    try {
      const exists = await fs.promises
        .access(oldPath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        // Disallow collisions
        const newExists = await fs.promises
          .access(newPath, fs.constants.F_OK)
          .then(() => true)
          .catch(() => false);
        if (newExists) {
          throw new Error('A scratchpad with the same name already exists');
        }
        await fs.promises.rename(oldPath, newPath);
      }
    } catch (error) {
      console.error('Failed to rename file:', error);
      throw error;
    }

    await this.saveMetadata();
  }

  async reorder(draggedId: string, targetId?: string): Promise<void> {
    const all = this.getScratchFiles();
    const draggedIndex = all.findIndex(f => f.id === draggedId);
    if (draggedIndex === -1) {
      return;
    }

    let insertIndex = all.length - 1;
    if (targetId) {
      const targetIndex = all.findIndex(f => f.id === targetId);
      if (targetIndex === -1) {
        return;
      }
      insertIndex = targetIndex;
    } else {
      // Dropping on empty space moves to end
      insertIndex = all.length - 1;
    }

    const [dragged] = all.splice(draggedIndex, 1);
    all.splice(insertIndex, 0, dragged);

    // Reassign order sequentially
    all.forEach((file, index) => {
      const existing = this.scratchFiles.get(file.id);
      if (existing) {
        existing.order = index;
      }
    });

    await this.saveMetadata();
  }
  async deleteScratchFile(id: string): Promise<void> {
    const file = this.scratchFiles.get(id);
    if (!file) {
      return;
    }

    const filePath = this.getFilePath(id);

    try {
      const exists = await fs.promises
        .access(filePath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        await fs.promises.unlink(filePath);
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }

    this.scratchFiles.delete(id);
    await this.saveMetadata();
  }

  getNextFileNumber(extension: string): number {
    let maxNumber = 0;
    const prefix = 'scratchpad_';
    const pattern = new RegExp(`^${prefix}(\\d+)\\${extension}$`);

    for (const file of this.scratchFiles.values()) {
      const match = file.name.match(pattern);
      if (match) {
        const number = parseInt(match[1], 10);
        maxNumber = Math.max(maxNumber, number);
      }
    }

    return maxNumber + 1;
  }

  getLanguageFromExtension(extension: string): string | undefined {
    const languageMap: { [key: string]: string } = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.html': 'html',
      '.css': 'css',
      '.json': 'json',
      '.xml': 'xml',
      '.md': 'markdown',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.sh': 'shellscript',
      '.sql': 'sql',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.txt': 'plaintext'
    };

    return languageMap[extension];
  }

  private async saveFileContent(id: string, content: string): Promise<void> {
    const filePath = this.getFilePath(id);
    try {
      await fs.promises.writeFile(filePath, content, 'utf8');
    } catch (error) {
      console.error('Failed to save file content:', error);
    }
  }

  private getNextOrderIndex(): number {
    const orders = Array.from(this.scratchFiles.values())
      .map(f => f.order)
      .filter((o): o is number => typeof o === 'number');
    if (orders.length === 0) {
      return 0;
    }
    return Math.max(...orders) + 1;
  }

  loadFileContent(id: string): string {
    const filePath = this.getFilePath(id);
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
    } catch (error) {
      console.error('Failed to load file content:', error);
    }
    return '';
  }
}
