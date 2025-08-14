import * as vscode from 'vscode';
import { Bookmark, getBookmarkColor } from './Models';
import { isDarkTheme } from '../../common/utils/themeUtils';
import * as path from 'path';

export class BookmarkDecorationService {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private defaultDecorationType: vscode.TextEditorDecorationType;

  constructor(private context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.onThemeChange();
      })
    );

    const defaultColor = getBookmarkColor('default');
    const iconUri = this.getBookmarkIconUri('default', context);

    this.defaultDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: iconUri,
      gutterIconSize: 'contain',
      overviewRulerColor: defaultColor.hexValue,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }

  updateDecorations(bookmarks: Bookmark[]): void {
    this.clearAllDecorations();

    const decorationsByFileAndColor = new Map<string, Map<string | undefined, vscode.DecorationOptions[]>>();

    for (const bookmark of bookmarks) {
      const fileDecorations = decorationsByFileAndColor.get(bookmark.fileUri) || new Map();
      const colorDecorations = fileDecorations.get(bookmark.color) || [];

      colorDecorations.push({
        range: new vscode.Range(bookmark.line, 0, bookmark.line, 0),
        hoverMessage: bookmark.text
      });

      fileDecorations.set(bookmark.color, colorDecorations);
      decorationsByFileAndColor.set(bookmark.fileUri, fileDecorations);
    }

    for (const editor of vscode.window.visibleTextEditors) {
      const uri = editor.document.uri.toString();
      const fileDecorations = decorationsByFileAndColor.get(uri);

      if (fileDecorations) {
        for (const [color, decorations] of fileDecorations) {
          const decorationType = this.getDecorationType(color);
          editor.setDecorations(decorationType, decorations);
        }
      }
    }
  }

  updateFileDecorations(fileUri: string, bookmarks: Bookmark[]): void {
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === fileUri
    );

    if (!editor) {
      return;
    }

    this.clearFileDecorations(editor);

    const decorationsByColor = new Map<string | undefined, vscode.DecorationOptions[]>();

    for (const bookmark of bookmarks) {
      const decorations = decorationsByColor.get(bookmark.color) || [];
      decorations.push({
        range: new vscode.Range(bookmark.line, 0, bookmark.line, 0),
        hoverMessage: bookmark.text
      });
      decorationsByColor.set(bookmark.color, decorations);
    }

    for (const [color, decorations] of decorationsByColor) {
      const decorationType = this.getDecorationType(color);
      editor.setDecorations(decorationType, decorations);
    }
  }

  private getBookmarkIconUri(colorName: string | undefined, context: vscode.ExtensionContext): vscode.Uri {
    const theme = isDarkTheme() ? 'dark' : 'light';

    const bookmarkColor = getBookmarkColor(colorName);
    const fileName = bookmarkColor.icon;

    const iconPath = path.join('media', 'bookmarks', theme, `${fileName}.png`);
    return vscode.Uri.joinPath(context.extensionUri, iconPath);
  }

  private getDecorationType(colorName?: string): vscode.TextEditorDecorationType {
    if (!colorName) {
      return this.defaultDecorationType;
    }

    let decorationType = this.decorationTypes.get(colorName);
    if (!decorationType) {
      const bookmarkColor = getBookmarkColor(colorName);
      const iconUri = this.getBookmarkIconUri(colorName, this.context);

      decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: iconUri,
        gutterIconSize: 'contain',
        overviewRulerColor: bookmarkColor.hexValue,
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      });
      this.decorationTypes.set(colorName, decorationType);
    }

    return decorationType;
  }

  private onThemeChange(): void {
    this.defaultDecorationType.dispose();
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();

    const defaultColor = getBookmarkColor('default');
    const iconUri = this.getBookmarkIconUri('default', this.context);

    this.defaultDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: iconUri,
      gutterIconSize: 'contain',
      overviewRulerColor: defaultColor.hexValue,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }

  private clearFileDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.defaultDecorationType, []);

    for (const decorationType of this.decorationTypes.values()) {
      editor.setDecorations(decorationType, []);
    }
  }

  private clearAllDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.clearFileDecorations(editor);
    }
  }

  dispose(): void {
    this.defaultDecorationType.dispose();

    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();
  }
}
