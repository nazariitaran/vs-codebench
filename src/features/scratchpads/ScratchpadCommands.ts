import * as vscode from 'vscode';
import { ScratchpadsProvider } from './ScratchpadsProvider';
import ScratchpadValidator from './ScratchpadValidator';

export function registerScratchpadCommands(
  context: vscode.ExtensionContext,
  scratchpadsProvider: ScratchpadsProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('vs-codebench.createScratchpad', async () => {
      await scratchpadsProvider.createScratchFile();
    }),

    vscode.commands.registerCommand('vs-codebench.saveUnsavedAsScratchpad', async () => {
      await scratchpadsProvider.saveActiveUnsavedEditorAsScratchpad();
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
    }),

    // Folder commands
    vscode.commands.registerCommand('vs-codebench.addScratchpadFolder', async (item?: any) => {
      const folderName = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'Folder name',
        validateInput: ScratchpadValidator.validateFolderName
      });

      if (folderName) {
        const parentId = item?.id;
        await scratchpadsProvider.addFolder(folderName, parentId);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.addRootScratchpadFolder', async () => {
      const folderName = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'Folder name',
        validateInput: ScratchpadValidator.validateFolderName
      });

      if (folderName) {
        await scratchpadsProvider.addFolder(folderName, undefined);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.editScratchpadFolder', async (item: any) => {
      if (item && item.id) {
        const folderName = await vscode.window.showInputBox({
          prompt: 'Edit folder name',
          value: item.label,
          validateInput: ScratchpadValidator.validateFolderName
        });

        if (folderName && folderName !== item.label) {
          await scratchpadsProvider.editFolder(item.id, folderName);
        }
      }
    }),

    vscode.commands.registerCommand('vs-codebench.deleteScratchpadFolder', async (item: any) => {
      if (item && item.id) {
        await scratchpadsProvider.deleteFolder(item.id);
      }
    })
  );
}
