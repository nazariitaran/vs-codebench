import * as vscode from 'vscode';
import { ScratchpadsProvider } from './ScratchpadsProvider';

export function registerScratchpadCommands(
  context: vscode.ExtensionContext,
  scratchpadsProvider: ScratchpadsProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('vs-codebench.createScratchpad', async () => {
      await scratchpadsProvider.createScratchFile();
    }),

    vscode.commands.registerCommand('vs-codebench.openScratchFile', async (id: string) => {
      await scratchpadsProvider.openScratchFile(id);
    }),

    vscode.commands.registerCommand('vs-codebench.renameScratchFile', async (item: any) => {
      if (item && item.scratchFile) {
        await scratchpadsProvider.renameScratchFile(item.scratchFile.id);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.deleteScratchFile', async (item: any) => {
      if (item && item.scratchFile) {
        await scratchpadsProvider.deleteScratchFile(item.scratchFile.id);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.clearAllScratchpads', async () => {
      await scratchpadsProvider.clearAllScratchpads();
    })
  );
}
