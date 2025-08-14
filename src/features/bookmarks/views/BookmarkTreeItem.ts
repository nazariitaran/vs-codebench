import * as vscode from 'vscode';
import { getBookmarkColor } from '../Models';

export class BookmarkTreeItem extends vscode.TreeItem {
  private originalLabel: string;
  private originalDescription?: string;
  private isMissingFile: boolean = false;
  public parentId?: string;

  constructor(
    label: string,
    description?: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly colorName?: string
  ) {
    super(label, collapsibleState);

    this.originalLabel = label;
    this.originalDescription = description;

    this.description = description;

    const bookmarkColor = getBookmarkColor(colorName);
    this.iconPath = new vscode.ThemeIcon('bookmark', new vscode.ThemeColor(bookmarkColor.themeColor));

    this.contextValue = 'bookmarkItem';
  }

  /**
   * Apply strikethrough style when the bookmark's file is missing
   */
  setMissingFile(): void {
    this.isMissingFile = true;

    this.label = this.strikethrough(this.originalLabel);

    if (this.originalDescription) {
      this.description = this.strikethrough(this.originalDescription) + ' (missing)';
    }

    this.tooltip = `⚠️ File not found\n${this.originalDescription || ''}\n\nThe file associated with this bookmark no longer exists.`;

    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));

    this.contextValue = 'bookmarkItemMissing';
  }

  /**
   * Apply strikethrough effect to text using Unicode combining character
   */
  private strikethrough(text: string): string {
    // Use combining long stroke overlay character for strikethrough effect
    return text.split('').map(char => char + '\u0336').join('');
  }
}
