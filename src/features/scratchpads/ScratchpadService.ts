import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { ScratchFile, ScratchpadData, CURRENT_SCRATCHPAD_VERSION } from './Models';
import { NamespacedStorageService, createNamespacedStorage } from '../../common/storage/StorageService';

export class ScratchpadService {
  private scratchFiles: Map<string, ScratchFile> = new Map();
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
        files: []
      }, { scope: 'auto' });

      this.scratchFiles.clear();
      data.files.forEach(file => {
        this.scratchFiles.set(file.id, file);
      });
    } catch (error) {
      console.error('Failed to load scratch files:', error);
    }
  }

  async saveMetadata(): Promise<void> {
    try {
      const data: ScratchpadData = {
        version: CURRENT_SCRATCHPAD_VERSION,
        files: Array.from(this.scratchFiles.values())
      };
      await this.storage.store('metadata', data, { scope: 'auto' });
    } catch (error) {
      console.error('Failed to save metadata:', error);
    }
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
