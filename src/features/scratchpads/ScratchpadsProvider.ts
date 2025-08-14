import * as vscode from 'vscode';
import { ScratchpadItem } from './views/ScratchpadItem';
import { ScratchpadService } from './ScratchpadService';

export class ScratchpadsProvider implements vscode.TreeDataProvider<ScratchpadItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ScratchpadItem | undefined | null | void> = new vscode.EventEmitter<ScratchpadItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ScratchpadItem | undefined | null | void> = this._onDidChangeTreeData.event;

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

  getTreeItem(element: ScratchpadItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ScratchpadItem): Thenable<ScratchpadItem[]> {
    if (!element) {
      const items = this.scratchpadService.getScratchFiles()
        .map(file => new ScratchpadItem(file));
      return Promise.resolve(items);
    }

    // For now, we don't support children
    return Promise.resolve([]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async reorderScratchpad(draggedId: string, targetId?: string): Promise<void> {
    await this.scratchpadService.reorder(draggedId, targetId);
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

    const fileNumber = this.scratchpadService.getNextFileNumber(selected.extension);
    const fileName = `scratchpad_${fileNumber}${selected.extension}`;
    const language = this.scratchpadService.getLanguageFromExtension(selected.extension);

    const scratchFile = await this.scratchpadService.createScratchFile(fileName, language);
    this.refresh();

    await this.openScratchFile(scratchFile.id);
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
