import * as vscode from 'vscode';
import * as path from 'path';
import { randomId } from '../../common/utils/idUtils';
import * as fs from 'fs';
import { ScratchFile, ScratchpadFolder, ScratchpadData, CURRENT_SCRATCHPAD_VERSION, MAX_SCRATCH_FILES } from './Models';
import { NamespacedStorageService, createNamespacedStorage } from '../../common/storage/StorageService';

export const SCRATCHPAD_URI_SCHEME = 'codebench-scratchpad';

interface LegacyScratchFile extends ScratchFile {
  content?: string;
}

interface LegacyScratchpadData {
  version: number;
  files: LegacyScratchFile[];
  folders?: ScratchpadFolder[];
}

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
      const data = await this.storage.retrieve<LegacyScratchpadData>('metadata', {
        version: CURRENT_SCRATCHPAD_VERSION,
        files: [],
        folders: []
      }, { scope: 'auto' });

      const migrated = await this.migrateScratchpadData(data);

      await this.ensureBackingFilesExist(migrated.files, migrated.legacyContentById);

      this.scratchFiles.clear();
      this.folders = migrated.folders;

      migrated.files.forEach(file => {
        this.scratchFiles.set(file.id, file);
      });

      if (migrated.changed) {
        await this.saveMetadata();
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

  findNextImportFolderName(baseName: string = '_import'): string {
    const existingNames = this.folders
      .filter(f => f.name === baseName || f.name.startsWith(baseName + '_'))
      .map(f => f.name);

    if (!existingNames.includes(baseName)) {
      return baseName;
    }

    let counter = 1;
    while (existingNames.includes(`${baseName}_${counter}`)) {
      counter++;
    }
    return `${baseName}_${counter}`;
  }

  async addFolder(name: string, parentId?: string): Promise<ScratchpadFolder> {
    const siblings = this.getFolderSiblings(parentId);
    const orders = siblings.map(s => s.order).filter((o): o is number => o !== undefined);
    const maxOrder = orders.length > 0 ? Math.max(...orders) : -1;

    const newFolder: ScratchpadFolder = {
      id: randomId(),
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
    await this.deleteFolderRecursive(id);

    // Normalize order after deletion
    const siblings = this.getFolderSiblings(parentId);
    siblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    siblings.forEach((item, index) => { item.order = index; });

    await this.saveMetadata();
  }

  private async deleteFolderRecursive(folderId: string): Promise<void> {
    // Delete all files in this folder and remove their backing files from storage.
    for (const [fileId, file] of this.scratchFiles.entries()) {
      if (file.parentId === folderId) {
        await this.deleteStoredFile(fileId);
        this.scratchFiles.delete(fileId);
      }
    }

    // Recursively delete subfolders
    const subfolders = this.folders.filter(f => f.parentId === folderId);
    for (const subfolder of subfolders) {
      await this.deleteFolderRecursive(subfolder.id);
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
        if (targetDepth + folderDepth > 10) {
          throw new Error('Moving this folder would exceed maximum depth (10 levels)');
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
      if (targetDepth + folderDepth > 10) {
        throw new Error('Moving this folder would exceed maximum depth (10 levels)');
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
      await this.deleteStoredFile(file.id);
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

  getScratchpadIdFromUri(uri: vscode.Uri): string | undefined {
    if (uri.scheme !== SCRATCHPAD_URI_SCHEME) {
      return undefined;
    }

    const params = new URLSearchParams(uri.query);
    return params.get('id') ?? undefined;
  }

  getScratchpadUri(id: string): vscode.Uri {
    const file = this.scratchFiles.get(id);
    if (!file) {
      throw new Error(`Scratchpad not found for id ${id}`);
    }
    const virtualPath = `/${[...this.getFolderPathSegments(file.parentId), file.name].join('/')}`;
    const params = new URLSearchParams({ id });

    return vscode.Uri.from({
      scheme: SCRATCHPAD_URI_SCHEME,
      path: virtualPath,
      query: params.toString()
    });
  }

  getFilePath(id: string): string {
    const file = this.scratchFiles.get(id);
    if (file) {
      return this.getStoredFilePath(file);
    }
    // Fallback for files not yet in memory
    return path.join(this.scratchpadDirectory, `${id}.txt`);
  }

  async createScratchFile(fileName: string, language?: string, parentFolderId?: string): Promise<ScratchFile> {
    const id = randomId();

    const scratchFile: ScratchFile = {
      id,
      name: fileName,
      backingFileName: this.getCanonicalBackingFileName(id, fileName),
      language,
      parentId: parentFolderId,
      createdAt: Date.now(),
      lastModified: Date.now(),
      order: this.getNextOrderIndex()
    };

    await this.saveFileContent(id, '', scratchFile);
    this.scratchFiles.set(id, scratchFile);
    await this.saveMetadata();

    return scratchFile;
  }

  async updateFileContent(id: string, content: string): Promise<void> {
    const file = this.scratchFiles.get(id);
    if (file) {
      const lastModified = Date.now();
      await this.saveFileContent(id, content, file);
      file.lastModified = lastModified;
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

    file.name = targetName;
    file.lastModified = Date.now();

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

    await this.deleteStoredFile(id);

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

  private async saveFileContent(id: string, content: string, file?: Pick<ScratchFile, 'id' | 'name' | 'backingFileName'>): Promise<void> {
    await this.ensureStorageExists();
    const filePath = file ? this.getStoredFilePath(file) : this.getFilePath(id);
    await fs.promises.writeFile(filePath, content, 'utf8');
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

  // ─── Import from Directory ────────────────────────────────────────────────────

  private static readonly MAX_SCRATCH_FILES = 400;
  private static readonly MAX_FOLDER_DEPTH = 10;
  private static readonly TEXT_SAMPLE_BYTES = 8192;

  async importScratchpadsFromDirectory(
    dirPath: string,
    parentFolderId?: string,
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<ImportResult> {
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      overwritten: 0,
      errors: 0,
      errorMessages: [],
      discoveredFiles: [],
      skippedFiles: [],
      importedFileIds: []
    };

    // Collect all text files first (collect all files for discovery, even non-text)
    const { filesToImport, discoveredFiles, skippedFiles, skippedDueToLimit } = await this.collectTextFiles(dirPath, parentFolderId);
    result.discoveredFiles = discoveredFiles;
    result.skippedFiles = [...skippedFiles, ...skippedDueToLimit];
    result.skipped = result.skippedFiles.length;
    const total = filesToImport.length;

    // Handle count limit
    const currentCount = this.scratchFiles.size;
    const availableSlots = Math.max(0, ScratchpadService.MAX_SCRATCH_FILES - currentCount);

    if (filesToImport.length > availableSlots) {
      // Sort by path length (shorter first = closer to root) to prioritize shallow files
      filesToImport.sort((a, b) => {
        const depth = (p: string) => p.split(path.sep).filter(Boolean).length;
        return depth(a.absolutePath) - depth(b.absolutePath);
      });
    }

    for (let i = 0; i < filesToImport.length; i++) {
      const fileInfo = filesToImport[i];

      // Check if we've reached the limit
      if (this.scratchFiles.size >= ScratchpadService.MAX_SCRATCH_FILES) {
        result.skipped += filesToImport.length - i;
        result.skippedFiles.push(...filesToImport.slice(i).map(f => f.relativePath + ' (limit reached)'));
        break;
      }

      // Report progress
      if (onProgress) {
        onProgress(i + 1, total, fileInfo.name);
      }

      try {
        const existing = this.findScratchpadByName(fileInfo.name, fileInfo.parentId);
        if (existing) {
          // Overwrite content, keep ID
          await this.updateFileContent(existing.id, fileInfo.content);
          result.overwritten++;
        } else {
          // Create new
          const scratchFile = await this.createScratchFile(fileInfo.name, fileInfo.language);
          await this.updateFileContent(scratchFile.id, fileInfo.content);
          if (fileInfo.parentId) {
            await this.moveToFolder(scratchFile.id, fileInfo.parentId);
          }
          result.imported++;
          result.importedFileIds.push(scratchFile.id);
        }
      } catch (error) {
        result.errors++;
        if (result.errorMessages.length < 10) {
          result.errorMessages.push(`${fileInfo.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return result;
  }

  buildImportSummary(
    result: ImportResult,
    dirPath: string,
    folderName: string | undefined,
    parentFolderId?: string
  ): { summaryContent: string; importedFilePaths: string[] } {
    const timestamp = new Date().toLocaleString();

    // Build ASCII tree from file list
    const buildTree = (files: string[]): string => {
      if (files.length === 0) { return '  (empty)'; }
      interface TreeNode { [key: string]: TreeNode | string[] | undefined; }
      const tree: TreeNode = {};
      for (const f of files) {
        const parts = f.split('/');
        let current: TreeNode = tree;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (i === parts.length - 1) {
            if (part === '') {
              // Path ends with '/' — this is a folder-only entry; node already created above
              break;
            }
            // File
            if (!current['@files']) { current['@files'] = []; }
            (current['@files'] as string[]).push(part);
          } else {
            // Folder
            if (!current[part]) { current[part] = {}; }
            current = current[part] as TreeNode;
          }
        }
      }
      const render = (node: TreeNode, prefix: string = ''): string => {
        let output = '';
        const dirs = Object.keys(node).filter(k => k !== '@files').sort();
        const files_list = (node['@files'] as string[]) || [];
        for (let i = 0; i < dirs.length; i++) {
          const isLast = i === dirs.length - 1 && files_list.length === 0;
          output += prefix + (isLast ? '└── ' : '├── ') + dirs[i] + '/\n';
          output += render(node[dirs[i]] as TreeNode, prefix + (isLast ? '    ' : '│   '));
        }
        for (let i = 0; i < files_list.length; i++) {
          const isLast = i === files_list.length - 1;
          output += prefix + (isLast ? '└── ' : '├── ') + files_list[i] + '\n';
        }
        return output;
      };
      return render(tree);
    };

    // Sort discovered and skipped files
    const discoveredFiles = [...result.discoveredFiles].sort();
    const skippedFiles = [...result.skippedFiles].sort();

    // Build imported files list with folder structure
    const importedFiles = result.importedFileIds
      .map(id => this.scratchFiles.get(id))
      .filter((f): f is ScratchFile => f !== undefined);

    // Build folder path map (folderId -> path like "src/utils")
    const folders = this.getFolders();
    const folderPathMap: { [id: string]: string } = {};
    const buildFolderPath = (folderId: string): string => {
      if (folderPathMap[folderId]) { return folderPathMap[folderId]; }
      const folder = folders.find(f => f.id === folderId);
      if (!folder) { return ''; }
      const parentPath = folder.parentId ? buildFolderPath(folder.parentId) : '';
      const fp = parentPath ? parentPath + '/' + folder.name : folder.name;
      folderPathMap[folderId] = fp;
      return fp;
    };

    // Build imported file paths with folder structure
    const importedFilePaths: string[] = [];
    for (const file of importedFiles) {
      const fp = file.parentId ? buildFolderPath(file.parentId) : '';
      importedFilePaths.push(fp ? fp + '/' + file.name : file.name);
    }
    importedFilePaths.sort();

    let summaryContent = `# Import Summary - ${timestamp}\n\n` +
      `**Source:** \`${dirPath}\`\n` +
      `**Folder:** ${folderName ?? 'Root'}\n\n` +
      `## Results\n` +
      `- Imported: ${result.imported}\n` +
      (result.overwritten > 0 ? `- Overwritten: ${result.overwritten}\n` : '') +
      (result.skipped > 0 ? `- Skipped: ${result.skipped}\n` : '') +
      (result.errors > 0 ? `- Errors: ${result.errors}\n` : '') +
      '\n## Discovered Files (' + discoveredFiles.filter(f => !f.endsWith('/')).length + ')\n```\n' + buildTree(discoveredFiles) + '```\n';
    if (skippedFiles.length > 0) {
      summaryContent += '\n## Skipped Files (' + skippedFiles.length + ')\n```\n' + buildTree(skippedFiles) + '```\n';
    }
    summaryContent += '\n## Imported Files (' + importedFiles.length + ')\n```\n' + buildTree(importedFilePaths) + '```\n';
    if (result.errors > 0 && result.errorMessages.length > 0) {
      summaryContent += '\n## Errors\n';
      for (const err of result.errorMessages) {
        summaryContent += `- ${err}\n`;
      }
    }

    return { summaryContent, importedFilePaths };
  }

  private async collectTextFiles(
    dirPath: string,
    parentFolderId?: string,
    prefix: string = ''
  ): Promise<{
    filesToImport: ImportFileInfo[];
    discoveredFiles: string[];
    skippedFiles: string[];
    skippedDueToLimit: string[];
  }> {
    const files: ImportFileInfo[] = [];
    const discoveredFiles: string[] = [];
    const skippedFiles: string[] = [];
    const skippedDueToLimit: string[] = [];
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip symlinks
      try {
        const stat = await fs.promises.lstat(fullPath);
        if (stat.isSymbolicLink()) {
          continue;
        }
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        // Create or find folder, then recurse
        let folderId = parentFolderId;
        const depth = parentFolderId ? this.getFolderDepth(parentFolderId) : 0;
        if (depth < ScratchpadService.MAX_FOLDER_DEPTH) {
          // Check if folder exists at this level
          const existingFolder = this.folders.find(
            f => f.name === entry.name && f.parentId === parentFolderId
          );
          if (existingFolder) {
            folderId = existingFolder.id;
          } else {
            const created = await this.addFolder(entry.name, parentFolderId);
            folderId = created.id;
          }
          // Discover directory in tree
          discoveredFiles.push(prefix + entry.name + '/');
          const childResult = await this.collectTextFiles(fullPath, folderId, prefix + entry.name + '/');
          files.push(...childResult.filesToImport);
          discoveredFiles.push(...childResult.discoveredFiles);
          skippedFiles.push(...childResult.skippedFiles);
          skippedDueToLimit.push(...childResult.skippedDueToLimit);
        } else {
          // Exceed depth, import files into deepest valid folder
          const childResult = await this.collectTextFiles(fullPath, folderId, prefix + entry.name + '/');
          files.push(...childResult.filesToImport);
          discoveredFiles.push(...childResult.discoveredFiles);
          skippedFiles.push(...childResult.skippedFiles);
          skippedDueToLimit.push(...childResult.skippedDueToLimit);
        }
      } else if (entry.isFile()) {
        // Check if text file
        const isText = await this.isTextFile(fullPath);
        const relativePath = prefix + entry.name;
        discoveredFiles.push(relativePath);
        if (!isText) {
          skippedFiles.push(relativePath + ' (binary)');
          continue;
        }

        // Read content
        let content = '';
        try {
          content = await fs.promises.readFile(fullPath, 'utf8');
        } catch {
          skippedFiles.push(relativePath + ' (read error)');
          continue;
        }

        // Detect language
        const language = this.getLanguageFromExtension(path.extname(entry.name));

        files.push({
          name: entry.name,
          content,
          language,
          parentId: parentFolderId,
          absolutePath: fullPath,
          relativePath
        });
      }
    }

    return { filesToImport: files, discoveredFiles, skippedFiles, skippedDueToLimit };
  }

  private async isTextFile(filePath: string): Promise<boolean> {
    let fd: import('fs').promises.FileHandle | undefined;
    try {
      fd = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(ScratchpadService.TEXT_SAMPLE_BYTES);
      const { bytesRead } = await fd.read(buffer, 0, ScratchpadService.TEXT_SAMPLE_BYTES, 0);
      // Check for null bytes in the sample
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      if (fd) {
        await fd.close();
      }
    }
  }

  private findScratchpadByName(name: string, parentId?: string): ScratchFile | undefined {
    return Array.from(this.scratchFiles.values()).find(
      f => f.name === name && f.parentId === parentId
    );
  }

  private async migrateScratchpadData(data: LegacyScratchpadData): Promise<{
    files: ScratchFile[];
    folders: ScratchpadFolder[];
    changed: boolean;
    legacyContentById: Map<string, string>;
  }> {
    let changed = false;
    let version = data.version;
    const legacyContentById = new Map<string, string>();
    let hasLegacyContent = false;
    let files = data.files.map(file => {
      const migratedFile = { ...file };
      if (typeof migratedFile.content === 'string') {
        legacyContentById.set(migratedFile.id, migratedFile.content);
        hasLegacyContent = true;
      }
      return migratedFile;
    });
    let folders = data.folders ? [...data.folders] : [];

    if (version < 2) {
      files = files.map(file => ({ ...file, parentId: undefined }));
      folders = [];
      version = 2;
      changed = true;
    }

    if (version < 3) {
      files = this.assignBackingFileNames(files);
      version = 3;
      changed = true;
    }

    if (hasLegacyContent && version <= CURRENT_SCRATCHPAD_VERSION) {
      files = files.map(({ content: _content, ...file }) => file);
      changed = true;
    }

    return { files, folders, changed, legacyContentById };
  }

  private assignBackingFileNames(files: LegacyScratchFile[]): LegacyScratchFile[] {
    const proposedCounts = new Map<string, number>();

    for (const file of files) {
      const proposed = file.backingFileName ?? file.name;
      proposedCounts.set(proposed, (proposedCounts.get(proposed) ?? 0) + 1);
    }

    const usedBackingNames = new Set<string>();

    return files.map(file => {
      const proposed = file.backingFileName ?? file.name;
      let backingFileName = proposed;

      if ((proposedCounts.get(proposed) ?? 0) > 1 || usedBackingNames.has(proposed)) {
        backingFileName = this.getCanonicalBackingFileName(file.id, file.name);
      }

      usedBackingNames.add(backingFileName);

      return {
        ...file,
        backingFileName
      };
    });
  }

  private async ensureBackingFilesExist(files: ScratchFile[], legacyContentById: Map<string, string>): Promise<void> {
    for (const file of files) {
      const filePath = this.getStoredFilePath(file);
      const exists = await this.fileExists(filePath);
      if (!exists) {
        const legacyContent = legacyContentById.get(file.id);
        if (legacyContent === undefined) {
          throw new Error(`Missing backing file for scratchpad ${file.id}`);
        }

        await this.saveFileContent(file.id, legacyContent, file);
      }
    }
  }

  private async deleteStoredFile(id: string): Promise<void> {
    const filePath = this.getFilePath(id);

    try {
      if (await this.fileExists(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete file ${filePath}:`, error);
    }
  }

  private getStoredFilePath(file: Pick<ScratchFile, 'id' | 'name' | 'backingFileName'>): string {
    return path.join(this.scratchpadDirectory, file.backingFileName ?? file.name);
  }

  private getCanonicalBackingFileName(id: string, displayName: string): string {
    const extension = path.extname(displayName) || '.txt';
    return `${id}${extension}`;
  }

  private getFolderPathSegments(parentId?: string): string[] {
    const segments: string[] = [];
    let currentId = parentId;

    while (currentId) {
      const folder = this.getFolderById(currentId);
      if (!folder) {
        break;
      }

      segments.unshift(folder.name);
      currentId = folder.parentId;
    }

    return segments;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    return fs.promises
      .access(filePath, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false);
  }
}

export interface ImportResult {
  imported: number;
  skipped: number;
  overwritten: number;
  errors: number;
  errorMessages: string[];
  discoveredFiles: string[];
  skippedFiles: string[];
  importedFileIds: string[];
}

interface ImportFileInfo {
  name: string;
  content: string;
  language?: string;
  parentId?: string;
  absolutePath: string;
  relativePath: string;
}
