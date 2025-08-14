import * as vscode from 'vscode';

export const isDarkTheme = (): boolean => {
  const theme = vscode.window.activeColorTheme;
  return theme.kind === vscode.ColorThemeKind.Dark || theme.kind === vscode.ColorThemeKind.HighContrast;
};
