import * as vscode from 'vscode';
import * as path from 'path';
import { ScratchFile } from '../Models';

export class ScratchpadItem extends vscode.TreeItem {
  constructor(
    public readonly scratchFile: ScratchFile
  ) {
    super(scratchFile.name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = `${this.scratchFile.name} - Last modified: ${new Date(
      this.scratchFile.lastModified
    ).toLocaleString()}`;
    this.description = this.getDescription();

    this.command = {
      command: 'vs-codebench.openScratchFile',
      title: 'Open Scratch File',
      arguments: [this.scratchFile.id],
    };

    this.resourceUri = vscode.Uri.parse(`file:///${this.scratchFile.name}`);
    this.contextValue = 'scratchpadItem';
    this.id = this.scratchFile.id;
  }

  private getDescription(): string {
    const now = Date.now();
    const diff = now - this.scratchFile.lastModified;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  }
}

