import * as vscode from 'vscode';

export function tabInputUri(input: unknown): vscode.Uri | undefined {
  if (!input || typeof input !== 'object' || !('uri' in input)) {
    return undefined;
  }

  const uri = (input as { uri?: unknown }).uri;
  return uri instanceof vscode.Uri ? uri : undefined;
}
