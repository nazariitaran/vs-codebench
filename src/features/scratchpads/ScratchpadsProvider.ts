import * as vscode from 'vscode';
import * as path from 'path';
import { ScratchpadItem } from './views/ScratchpadItem';
import { ScratchpadFolderTreeItem } from './views/ScratchpadFolderTreeItem';
import { ScratchpadService, ImportResult } from './ScratchpadService';
import { ScratchpadFolder } from './Models';

const LANGUAGE_TO_EXTENSION: Record<string, string> = {
  javascript: '.js',
  typescript: '.ts',
  python: '.py',
  java: '.java',
  cpp: '.cpp',
  csharp: '.cs',
  go: '.go',
  rust: '.rs',
  html: '.html',
  css: '.css',
  json: '.json',
  xml: '.xml',
  markdown: '.md',
  yaml: '.yaml',
  shellscript: '.sh',
  sql: '.sql',
  ruby: '.rb',
  php: '.php',
  swift: '.swift',
  plaintext: '.txt'
};

type TreeItem = ScratchpadItem | ScratchpadFolderTreeItem;

export class ScratchpadsProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  public scratchpadService: ScratchpadService;
  private openDocuments: Map<string, vscode.TextDocument> = new Map();

  constructor(private context: vscode.ExtensionContext, scratchpadService?: ScratchpadService) {
    this.scratchpadService = scratchpadService || new ScratchpadService(context);
    this.loadScratchFiles().catch(console.error);
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(this.onDocumentChange, this),
      vscode.workspace.onDidCloseTextDocument(this.onDocumentClose, this),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.loadScratchFiles().catch(console.error);
      })
    );
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: TreeItem): TreeItem | undefined {
    if (element instanceof ScratchpadItem) {
      const parentId = element.parentId;
      if (parentId) {
        const folder = this.scratchpadService.getFolderById(parentId);
        if (folder) {
          const depth = this.scratchpadService.getFolderDepth(folder.id);
          const isAtMaxDepth = depth >= 5;
          return new ScratchpadFolderTreeItem(folder.name, folder.id, folder.parentId, folder.isExpanded, isAtMaxDepth);
        }
      }
    } else if (element instanceof ScratchpadFolderTreeItem) {
      if (element.parentId) {
        const parentFolder = this.scratchpadService.getFolderById(element.parentId);
        if (parentFolder) {
          const depth = this.scratchpadService.getFolderDepth(parentFolder.id);
          const isAtMaxDepth = depth >= 5;
          return new ScratchpadFolderTreeItem(parentFolder.name, parentFolder.id, parentFolder.parentId, parentFolder.isExpanded, isAtMaxDepth);
        }
      }
    }
    return undefined;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    const folders = this.scratchpadService.getFolders();
    const allFiles = this.scratchpadService.getScratchFiles();

    if (!element) {
      // Root level
      const rootFolders = folders
        .filter(f => !f.parentId)
        .sort((a, b) => a.order - b.order)
        .map(folder => {
          const depth = this.scratchpadService.getFolderDepth(folder.id);
          const isAtMaxDepth = depth >= 5;
          return new ScratchpadFolderTreeItem(folder.name, folder.id, folder.parentId, folder.isExpanded, isAtMaxDepth);
        });

      const rootFiles = allFiles
        .filter(f => !f.parentId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(file => this.createScratchpadItem(file));

      return [...rootFolders, ...rootFiles];
    } else if (element instanceof ScratchpadFolderTreeItem) {
      const childFolders = folders
        .filter(f => f.parentId === element.id)
        .sort((a, b) => a.order - b.order)
        .map(folder => {
          const depth = this.scratchpadService.getFolderDepth(folder.id);
          const isAtMaxDepth = depth >= 5;
          return new ScratchpadFolderTreeItem(folder.name, folder.id, folder.parentId, folder.isExpanded, isAtMaxDepth);
        });

      const childFiles = allFiles
        .filter(f => f.parentId === element.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(file => this.createScratchpadItem(file));

      return [...childFolders, ...childFiles];
    }

    return [];
  }

  private createScratchpadItem(file: { id: string; name: string; lastModified: number; language?: string; parentId?: string }): ScratchpadItem {
    const item = new ScratchpadItem(file as any);
    item.parentId = file.parentId;
    return item;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async reorderScratchpad(draggedId: string, targetId?: string): Promise<void> {
    await this.scratchpadService.reorder(draggedId, targetId);
    this.refresh();
  }

  async reorderItem(draggedId: string, targetId: string, dropPosition: 'before' | 'after'): Promise<void> {
    await this.scratchpadService.reorderItem(draggedId, targetId, dropPosition);
    this.refresh();
  }

  async addFolder(name: string, parentId?: string): Promise<ScratchpadFolder> {
    const folder = await this.scratchpadService.addFolder(name, parentId);
    this.refresh();
    return folder;
  }

  async editFolder(id: string, name: string): Promise<void> {
    await this.scratchpadService.editFolder(id, name);
    this.refresh();
  }

  async deleteFolder(id: string): Promise<void> {
    await this.deleteFolderWithConfirmation(id);
  }

  async deleteFolderForTools(id: string): Promise<void> {
    await this.scratchpadService.deleteFolder(id);
    this.refresh();
  }

  private async deleteFolderWithConfirmation(id: string): Promise<void> {
    const folder = this.scratchpadService.getFolderById(id);
    if (!folder) {
      return;
    }

    const itemCount = this.scratchpadService.countFolderItems(id);
    const result = await vscode.window.showWarningMessage(
      itemCount > 0
        ? `Are you sure you want to delete "${folder.name}"? This will delete ${itemCount} item(s) including all subfolders and scratchpads.`
        : `Are you sure you want to delete "${folder.name}"?`,
      { modal: true },
      'Delete'
    );

    if (result !== 'Delete') {
      return;
    }

    await this.scratchpadService.deleteFolder(id);
    this.refresh();
  }

  async moveToFolder(itemId: string, targetFolderId?: string): Promise<void> {
    await this.scratchpadService.moveToFolder(itemId, targetFolderId);
    this.refresh();
  }

  async createScratchFile(): Promise<void> {
    // For now, simple list of file types
    const fileTypes = [
      { label: 'JavaScript', extension: '.js' },
      { label: 'TypeScript', extension: '.ts' },
      { label: 'Python', extension: '.py' },
      { label: 'Java', extension: '.java' },
      { label: 'C++', extension: '.cpp' },
      { label: 'C#', extension: '.cs' },
      { label: 'Go', extension: '.go' },
      { label: 'Rust', extension: '.rs' },
      { label: 'HTML', extension: '.html' },
      { label: 'CSS', extension: '.css' },
      { label: 'JSON', extension: '.json' },
      { label: 'XML', extension: '.xml' },
      { label: 'Markdown', extension: '.md' },
      { label: 'YAML', extension: '.yaml' },
      { label: 'Shell Script', extension: '.sh' },
      { label: 'SQL', extension: '.sql' },
      { label: 'Ruby', extension: '.rb' },
      { label: 'PHP', extension: '.php' },
      { label: 'Swift', extension: '.swift' },
      { label: 'Plain Text', extension: '.txt' },
    ];

    const selected = await vscode.window.showQuickPick(fileTypes, {
      placeHolder: 'Select file type for your scratchpad'
    });

    if (!selected) {
      return;
    }

    await this.createScratchpadFromExtension(selected.extension);
  }

  getAllScratchpads() {
    return this.scratchpadService.getScratchFiles();
  }

  getScratchpadById(id: string) {
    return this.scratchpadService.getScratchFile(id);
  }

  getScratchpadContentForTools(id: string): string {
    const scratchpad = this.scratchpadService.getScratchFile(id);
    if (!scratchpad) {
      throw new Error('Scratchpad not found.');
    }

    return this.scratchpadService.loadFileContent(id);
  }

  async createScratchpadForTools(params: { name?: string; language?: string; content?: string; parentFolderId?: string }): Promise<void> {
    const extension = this.getExtensionForLanguage(params.language);
    const content = params.content ?? '';

    let fileName: string;
    if (params.name && params.name.trim().length > 0) {
      fileName = this.normalizeFileName(params.name.trim(), extension);
      const exists = this.scratchpadService.getScratchFiles().some(f => f.name === fileName);
      if (exists) {
        throw new Error('A scratchpad with this name already exists.');
      }
    } else {
      const fileNumber = this.scratchpadService.getNextFileNumber(extension);
      fileName = `scratchpad_${fileNumber}${extension}`;
    }
    const language = params.language || this.scratchpadService.getLanguageFromExtension(path.extname(fileName));
    const scratchFile = await this.scratchpadService.createScratchFile(fileName, language);
    if (content.length > 0) {
      await this.scratchpadService.updateFileContent(scratchFile.id, content);
    }
    if (params.parentFolderId) {
      await this.scratchpadService.moveToFolder(scratchFile.id, params.parentFolderId);
    }
    this.refresh();
  }

  async renameScratchFileForTools(id: string, newName: string): Promise<void> {
    const file = this.scratchpadService.getScratchFile(id);
    if (!file) {
      throw new Error('Scratchpad not found.');
    }

    const trimmed = (newName ?? '').trim();
    if (trimmed.length === 0) {
      throw new Error('File name cannot be empty.');
    }

    const providedExt = path.extname(trimmed);
    const oldExt = path.extname(file.name);
    const targetName = providedExt ? trimmed : `${trimmed}${oldExt}`;

    const sameNameExists = this.scratchpadService
      .getScratchFiles()
      .some(f => f.id !== id && f.name === targetName);
    if (sameNameExists) {
      throw new Error('A scratchpad with this name already exists.');
    }

    await this.scratchpadService.renameScratchFile(id, trimmed);
    this.refresh();
  }

  async updateScratchpadContentForTools(id: string, content: string): Promise<void> {
    const file = this.scratchpadService.getScratchFile(id);
    if (!file) {
      throw new Error('Scratchpad not found.');
    }

    await this.scratchpadService.updateFileContent(id, content);
    this.refresh();
  }

  async deleteScratchFileForTools(id: string): Promise<void> {
    await this.scratchpadService.deleteScratchFile(id);
    this.refresh();
  }

  async importScratchpadsFromDirectory(
    dirPath: string,
    parentFolderId?: string
  ): Promise<ImportResult> {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Importing Scratchpads',
        cancellable: false
      },
      async (progress) => {
        return this.scratchpadService.importScratchpadsFromDirectory(
          dirPath,
          parentFolderId,
          (current, total, fileName) => {
            progress.report({
              message: `${current}/${total}: ${fileName}`,
              increment: Math.floor(100 / total)
            });
          }
        );
      }
    );
    this.refresh();
    return result;
  }

  async saveActiveUnsavedEditorAsScratchpad(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showInformationMessage('Open an untitled editor to save it as a scratchpad.');
      return;
    }

    const document = activeEditor.document;
    if (document.uri.scheme !== 'untitled') {
      vscode.window.showInformationMessage('This command works only for unsaved untitled editors.');
      return;
    }

    const sourceUri = document.uri;
    const extension = this.getExtensionForDocument(document);
    const content = document.getText();

    await this.closeUntitledEditor(sourceUri);
    await this.createScratchpadFromExtension(extension, content);
  }

  async openScratchFile(id: string): Promise<void> {
    const file = this.scratchpadService.getScratchFile(id);
    if (!file) {
      return;
    }

    const filePath = this.scratchpadService.getFilePath(id);
    const uri = vscode.Uri.file(filePath);

    const doc = await vscode.workspace.openTextDocument(uri);
    this.openDocuments.set(id, doc);

    await vscode.window.showTextDocument(doc, {
      preview: false,
      preserveFocus: false
    });
  }

  async renameScratchFile(id: string): Promise<void> {
    const file = this.scratchpadService.getScratchFile(id);
    if (!file) {
      return;
    }

    const newName = await vscode.window.showInputBox({
      prompt: 'Enter new file name',
      value: file.name,
      validateInput: (value) => {
        if (value === undefined || value.trim().length === 0) {
          return 'File name cannot be empty';
        }
        if (!/^[a-zA-Z0-9_\-. ]+$/.test(value)) {
          return 'File name contains invalid characters';
        }
        return null;
      }
    });

    if (newName && newName !== file.name) {
      const openDoc = this.openDocuments.get(id);
      if (openDoc) {
        await vscode.window.showTextDocument(openDoc.uri, { preview: true, preserveFocus: false });
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        this.openDocuments.delete(id);
      }

      await this.scratchpadService.renameScratchFile(id, newName);
      this.refresh();
    }
  }

  async deleteScratchFile(id: string): Promise<void> {
    const file = this.scratchpadService.getScratchFile(id);
    if (!file) {
      return;
    }

    const result = await vscode.window.showWarningMessage(
      `Are you sure you want to delete \"${file.name}\"?`,
      { modal: true },
      'Delete'
    );

    if (result === 'Delete') {
      const openDoc = this.openDocuments.get(id);
      if (openDoc) {
        await vscode.window.showTextDocument(openDoc.uri, { preview: true, preserveFocus: false });
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        this.openDocuments.delete(id);
      }

      await this.scratchpadService.deleteScratchFile(id);
      this.refresh();
    }
  }

  async clearAllScratchpads(): Promise<void> {
    const files = this.scratchpadService.getScratchFiles();
    if (files.length === 0) {
      vscode.window.showInformationMessage('There are no scratchpads to clear.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Clear all ${files.length} scratchpad${files.length !== 1 ? 's' : ''}? This cannot be undone.`,
      { modal: true },
      'Clear All'
    );
    if (confirm !== 'Clear All') {
      return;
    }

    // Close any open scratchpad editors
    for (const [id, openDoc] of this.openDocuments) {
      try {
        await vscode.window.showTextDocument(openDoc.uri, { preview: true, preserveFocus: false });
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      } catch {
        // ignore
      }
    }
    this.openDocuments.clear();

    await this.scratchpadService.clearAll();
    this.refresh();
  }

  private async loadScratchFiles(): Promise<void> {
    await this.scratchpadService.loadScratchFiles();
    this.refresh();
  }

  private async createScratchpadFromExtension(extension: string, content = ''): Promise<void> {
    const fileNumber = this.scratchpadService.getNextFileNumber(extension);
    const fileName = `scratchpad_${fileNumber}${extension}`;
    const language = this.scratchpadService.getLanguageFromExtension(extension);

    const scratchFile = await this.scratchpadService.createScratchFile(fileName, language);
    if (content.length > 0) {
      await this.scratchpadService.updateFileContent(scratchFile.id, content);
    }

    this.refresh();
    await this.openScratchFile(scratchFile.id);
  }

  private getExtensionForLanguage(language?: string): string {
    if (!language) {
      return '.txt';
    }
    const normalized = language.toLowerCase();
    const entry = Object.entries(LANGUAGE_TO_EXTENSION)
      .find(([lang]) => lang.toLowerCase() === normalized);
    return entry?.[1] ?? '.txt';
  }

  private normalizeFileName(fileName: string, extension: string): string {
    if (path.extname(fileName)) {
      return fileName;
    }
    return `${fileName}${extension}`;
  }

  private getExtensionForDocument(document: vscode.TextDocument): string {
    const fileNameExtension = path.extname(document.fileName || '').toLowerCase();
    if (fileNameExtension) {
      return fileNameExtension;
    }

    const mappedExtension = LANGUAGE_TO_EXTENSION[document.languageId];
    return mappedExtension || '.txt';
  }

  private async closeUntitledEditor(uri: vscode.Uri): Promise<void> {
    const target = uri.toString();

    const tab = vscode.window.tabGroups.all
      .flatMap(group => group.tabs)
      .find((candidateTab) => {
        const input = candidateTab.input as { uri?: vscode.Uri };
        return input.uri?.toString() === target;
      });

    if (tab) {
      await vscode.window.tabGroups.close(tab, true);
      return;
    }

    const matchingEditor = vscode.window.visibleTextEditors
      .find(editor => editor.document.uri.toString() === target);

    if (!matchingEditor) {
      return;
    }

    await vscode.window.showTextDocument(matchingEditor.document, { preview: true, preserveFocus: false });
    try {
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    } catch {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
  }

  private async onDocumentChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
    for (const [id, doc] of this.openDocuments) {
      if (doc.uri.toString() === event.document.uri.toString()) {
        const content = event.document.getText();
        await this.scratchpadService.updateFileContent(id, content);
        this.refresh();
        break;
      }
    }
  }

  private onDocumentClose(document: vscode.TextDocument): void {
    for (const [id, doc] of this.openDocuments) {
      if (doc.uri.toString() === document.uri.toString()) {
        this.openDocuments.delete(id);
        break;
      }
    }
  }

  dispose(): void {
    // Dispose the event emitter
    this._onDidChangeTreeData.dispose();
    // Note: All other disposables are managed by context.subscriptions
  }
}
