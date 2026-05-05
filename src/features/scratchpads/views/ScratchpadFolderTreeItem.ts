import * as vscode from 'vscode';

export class ScratchpadFolderTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly id: string,
    public readonly parentId?: string,
    public readonly isExpanded?: boolean,
    public readonly isAtMaxDepth: boolean = false
  ) {
    super(label, isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);

    this.iconPath = new vscode.ThemeIcon('folder');

    this.contextValue = isAtMaxDepth ? 'scratchpadFolderMaxDepth' : 'scratchpadFolder';

    this.id = id;
  }
}
