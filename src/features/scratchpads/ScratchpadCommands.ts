import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ScratchpadsProvider } from './ScratchpadsProvider';
import ScratchpadValidator from './ScratchpadValidator';
import { ScratchFile } from './Models';

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
    }),

    vscode.commands.registerCommand('vs-codebench.importScratchpads', async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select folder to import scratchpads from'
      });

      if (!selected || selected.length === 0) {
        return;
      }

      const dirPath = selected[0].fsPath;

      const importChoice = await vscode.window.showQuickPick(
        [
          { label: 'Yes', description: "Import into a dedicated '_import' folder" },
          { label: 'No', description: 'Import to root' }
        ],
        {
          placeHolder: "Import into a dedicated folder?",
          title: 'Import Scratchpads'
        }
      );

      if (!importChoice) {
        return;
      }

      let parentFolderId: string | undefined;
      let folderName: string | undefined;
      if (importChoice.label === 'Yes') {
        folderName = scratchpadsProvider.scratchpadService.findNextImportFolderName();
        const folder = await scratchpadsProvider.addFolder(folderName, undefined);
        parentFolderId = folder.id;
      }

      const result = await scratchpadsProvider.importScratchpadsFromDirectory(dirPath, parentFolderId);

      // Build summary
      const parts: string[] = [];
      if (result.imported > 0) { parts.push(`${result.imported} imported`); }
      if (result.overwritten > 0) { parts.push(`${result.overwritten} overwritten`); }
      if (result.skipped > 0) { parts.push(`${result.skipped} skipped (non-text or limit reached)`); }
      if (result.errors > 0) { parts.push(`${result.errors} errors`); }

      const message = parts.length > 0
        ? `Import complete: ${parts.join(', ')}`
        : 'Import complete: nothing to import';

      vscode.window.showInformationMessage(message);

      // Create import summary scratchpad
      if (result.imported > 0 || result.overwritten > 0 || result.skipped > 0) {
        const { summaryContent, importedFilePaths } = scratchpadsProvider.scratchpadService.buildImportSummary(
          result,
          dirPath,
          folderName,
          parentFolderId
        );

        // Use unique name to avoid conflict if summary already exists
        const summaryName = 'import_summary_' + Date.now() + '.md';
        const summaryScratchpad = await scratchpadsProvider.scratchpadService.createScratchFile(summaryName, 'markdown', parentFolderId);
        await scratchpadsProvider.scratchpadService.updateFileContent(summaryScratchpad.id, summaryContent);

        // Open the summary scratchpad
        await scratchpadsProvider.openScratchFile(summaryScratchpad.id);
      }
    })
  );
}
