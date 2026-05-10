import * as path from 'path';
import * as vscode from 'vscode';
import { ScratchpadsProvider } from './ScratchpadsProvider';

export class ScratchpadFileSystemProvider implements vscode.FileSystemProvider {
  private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(private readonly scratchpadsProvider: ScratchpadsProvider) {}

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    await this.scratchpadsProvider.whenReady();
    const file = this.getScratchFileForUri(uri);
    const content = this.scratchpadsProvider.scratchpadService.loadFileContent(file.id);

    return {
      type: vscode.FileType.File,
      ctime: file.createdAt,
      mtime: file.lastModified,
      size: Buffer.byteLength(content, 'utf8')
    };
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions('Scratchpad directories are managed by VS CodeBench.');
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    await this.scratchpadsProvider.whenReady();
    const file = this.getScratchFileForUri(uri);
    const content = this.scratchpadsProvider.scratchpadService.loadFileContent(file.id);
    return this.encoder.encode(content);
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { readonly create: boolean; readonly overwrite: boolean; }
  ): Promise<void> {
    await this.scratchpadsProvider.whenReady();
    const id = this.getScratchpadId(uri);
    const existing = this.scratchpadsProvider.scratchpadService.getScratchFile(id);

    if (!existing && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    if (!existing) {
      throw vscode.FileSystemError.NoPermissions('Scratchpads must be created through VS CodeBench commands.');
    }

    await this.scratchpadsProvider.scratchpadService.updateFileContent(id, this.decoder.decode(content));
    this.scratchpadsProvider.refresh();
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  async delete(uri: vscode.Uri): Promise<void> {
    await this.scratchpadsProvider.whenReady();
    const id = this.getScratchpadId(uri);
    await this.scratchpadsProvider.deleteScratchFileForTools(id);
    this.scratchpadsProvider.refresh();
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    _options: { readonly overwrite: boolean; }
  ): Promise<void> {
    await this.scratchpadsProvider.whenReady();
    const id = this.getScratchpadId(oldUri);
    const targetName = path.posix.basename(newUri.path);

    await this.scratchpadsProvider.scratchpadService.renameScratchFile(id, targetName);

    const updatedUri = this.scratchpadsProvider.scratchpadService.getScratchpadUri(id);
    this.scratchpadsProvider.refresh();
    this._onDidChangeFile.fire([
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: updatedUri }
    ]);
  }

  private getScratchpadId(uri: vscode.Uri): string {
    const id = this.scratchpadsProvider.scratchpadService.getScratchpadIdFromUri(uri);
    if (!id) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return id;
  }

  private getScratchFileForUri(uri: vscode.Uri) {
    const id = this.getScratchpadId(uri);
    const file = this.scratchpadsProvider.scratchpadService.getScratchFile(id);
    if (!file) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return file;
  }
}