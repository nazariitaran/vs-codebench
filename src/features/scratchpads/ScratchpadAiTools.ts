import * as vscode from 'vscode';
import { ScratchpadsProvider } from './ScratchpadsProvider';
import ScratchpadValidator from './ScratchpadValidator';

interface GetScratchpadsInput {
  language?: string;
  nameContains?: string;
  folderId?: string;
  includeAll?: boolean;
}

interface GetScratchpadContentInput {
  scratchpadId: string;
}

interface CreateScratchpadInput {
  name?: string;
  language?: string;
  content?: string;
  parentFolderId?: string;
}

interface RenameScratchpadInput {
  scratchpadId: string;
  newName: string;
}

interface UpdateScratchpadContentInput {
  scratchpadId: string;
  content: string;
}

interface DeleteScratchpadInput {
  scratchpadId: string;
}

interface CreateScratchpadFolderInput {
  name: string;
  parentFolderId?: string;
}

interface RenameScratchpadFolderInput {
  folderId: string;
  newName: string;
}

interface MoveScratchpadToFolderInput {
  scratchpadId: string;
  folderId?: string;
}

interface MoveScratchpadFolderInput {
  folderId: string;
  targetFolderId?: string;
}

interface DeleteScratchpadFolderInput {
  folderId: string;
}

function resultFromObject(payload: unknown): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))
  ]);
}

function toScratchpadMetadata(scratchpad: {
  id: string;
  name: string;
  language?: string;
  createdAt: number;
  lastModified: number;
  order?: number;
  parentId?: string;
}) {
  return {
    id: scratchpad.id,
    name: scratchpad.name,
    language: scratchpad.language,
    createdAt: scratchpad.createdAt,
    lastModified: scratchpad.lastModified,
    order: scratchpad.order,
    parentId: scratchpad.parentId
  };
}

function toFolderMetadata(folder: {
  id: string;
  name: string;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
  order: number;
}) {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    order: folder.order
  };
}

function getScratchpadFolderOrThrow(
  scratchpadsProvider: ScratchpadsProvider,
  folderId: string,
  missingMessage = 'Folder not found. Provide a valid folderId.'
) {
  const folder = scratchpadsProvider.scratchpadService.getFolderById(folderId);
  if (!folder) {
    throw new Error(missingMessage);
  }
  return folder;
}

class GetScratchpadsTool implements vscode.LanguageModelTool<GetScratchpadsInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetScratchpadsInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input ?? {};
    let scratchpads = this.scratchpadsProvider.getAllScratchpads();
    const includeAll = input.includeAll ?? false;

    if (input.folderId !== undefined) {
      getScratchpadFolderOrThrow(this.scratchpadsProvider, input.folderId);
      scratchpads = scratchpads.filter(file => file.parentId === input.folderId);
    } else if (!includeAll) {
      // Default: show root-level only unless the caller explicitly asks for all scratchpads.
      scratchpads = scratchpads.filter(file => !file.parentId);
    }

    if (input.language) {
      const language = input.language.toLowerCase();
      scratchpads = scratchpads.filter(file => (file.language ?? '').toLowerCase() === language);
    }

    if (input.nameContains) {
      const nameContains = input.nameContains.toLowerCase();
      scratchpads = scratchpads.filter(file => file.name.toLowerCase().includes(nameContains));
    }

    const folders = this.scratchpadsProvider.scratchpadService.getFolders();

    return resultFromObject({
      scope: input.folderId !== undefined ? 'folder' : includeAll ? 'all' : 'root',
      count: scratchpads.length,
      scratchpads: scratchpads.map(toScratchpadMetadata),
      folders: folders.map(toFolderMetadata)
    });
  }
}

class GetScratchpadContentTool implements vscode.LanguageModelTool<GetScratchpadContentInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetScratchpadContentInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const scratchpad = this.scratchpadsProvider.getScratchpadById(input.scratchpadId);
    if (!scratchpad) {
      throw new Error('Scratchpad not found.');
    }

    const content = this.scratchpadsProvider.getScratchpadContentForTools(input.scratchpadId);

    return resultFromObject({
      scratchpad: {
        ...toScratchpadMetadata(scratchpad),
        content
      }
    });
  }
}

class CreateScratchpadTool implements vscode.LanguageModelTool<CreateScratchpadInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CreateScratchpadInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input ?? {};
    const validationError = ScratchpadValidator.validateForCreate(input);
    if (validationError) {
      throw new Error(validationError);
    }

    if (input.parentFolderId) {
      getScratchpadFolderOrThrow(
        this.scratchpadsProvider,
        input.parentFolderId,
        'Parent folder not found. Provide a valid parentFolderId.'
      );
    }

    await this.scratchpadsProvider.createScratchpadForTools(input);

    const scratchpads = this.scratchpadsProvider.getAllScratchpads().map(toScratchpadMetadata);
    return resultFromObject({
      success: true,
      scratchpads
    });
  }
}

class UpdateScratchpadContentTool implements vscode.LanguageModelTool<UpdateScratchpadContentInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<UpdateScratchpadContentInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const scratchpad = this.scratchpadsProvider.getScratchpadById(input.scratchpadId);
    if (!scratchpad) {
      throw new Error('Scratchpad not found. Provide a valid scratchpadId.');
    }

    await this.scratchpadsProvider.updateScratchpadContentForTools(input.scratchpadId, input.content);

    const content = this.scratchpadsProvider.getScratchpadContentForTools(input.scratchpadId);
    return resultFromObject({
      success: true,
      scratchpad: {
        ...toScratchpadMetadata(scratchpad),
        content
      }
    });
  }
}

class RenameScratchpadTool implements vscode.LanguageModelTool<RenameScratchpadInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RenameScratchpadInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    await this.scratchpadsProvider.renameScratchFileForTools(input.scratchpadId, input.newName);

    const scratchpads = this.scratchpadsProvider.getAllScratchpads().map(toScratchpadMetadata);
    return resultFromObject({
      success: true,
      scratchpads
    });
  }
}

class DeleteScratchpadTool implements vscode.LanguageModelTool<DeleteScratchpadInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DeleteScratchpadInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    await this.scratchpadsProvider.deleteScratchFileForTools(input.scratchpadId);

    return resultFromObject({
      success: true,
      deletedScratchpadId: input.scratchpadId
    });
  }
}

class CreateScratchpadFolderTool implements vscode.LanguageModelTool<CreateScratchpadFolderInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CreateScratchpadFolderInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;

    // Validate folder name before creation
    const validationError = ScratchpadValidator.validateFolderName(input.name);
    if (validationError) {
      throw new Error(validationError);
    }

    if (input.parentFolderId) {
      const parentFolder = getScratchpadFolderOrThrow(
        this.scratchpadsProvider,
        input.parentFolderId,
        'Parent folder not found. Provide a valid parentFolderId.'
      );
      const parentDepth = this.scratchpadsProvider.scratchpadService.getFolderDepth(parentFolder.id);
      if (parentDepth >= 5) {
        throw new Error('Maximum folder depth (5 levels) reached.');
      }
    }

    const folder = await this.scratchpadsProvider.addFolder(input.name, input.parentFolderId);

    return resultFromObject({
      success: true,
      folder: toFolderMetadata(folder)
    });
  }
}

class RenameScratchpadFolderTool implements vscode.LanguageModelTool<RenameScratchpadFolderInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RenameScratchpadFolderInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const folder = getScratchpadFolderOrThrow(this.scratchpadsProvider, input.folderId);

    const validationError = ScratchpadValidator.validateFolderName(input.newName);
    if (validationError) {
      throw new Error(validationError);
    }

    await this.scratchpadsProvider.editFolder(input.folderId, input.newName);
    const updated = getScratchpadFolderOrThrow(this.scratchpadsProvider, input.folderId);

    return resultFromObject({
      success: true,
      folder: toFolderMetadata(updated),
      previousName: folder.name
    });
  }
}

class MoveScratchpadToFolderTool implements vscode.LanguageModelTool<MoveScratchpadToFolderInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<MoveScratchpadToFolderInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const scratchpad = this.scratchpadsProvider.scratchpadService.getScratchFile(input.scratchpadId);
    if (!scratchpad) {
      throw new Error('Scratchpad not found. Provide a valid scratchpadId.');
    }

    if (input.folderId) {
      getScratchpadFolderOrThrow(this.scratchpadsProvider, input.folderId);
    }

    await this.scratchpadsProvider.moveToFolder(input.scratchpadId, input.folderId);
    const updated = this.scratchpadsProvider.scratchpadService.getScratchFile(input.scratchpadId);

    return resultFromObject({
      success: true,
      movedToRoot: !input.folderId,
      scratchpad: updated ? toScratchpadMetadata(updated) : undefined
    });
  }
}

class MoveScratchpadFolderTool implements vscode.LanguageModelTool<MoveScratchpadFolderInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<MoveScratchpadFolderInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    getScratchpadFolderOrThrow(this.scratchpadsProvider, input.folderId);

    if (input.targetFolderId) {
      getScratchpadFolderOrThrow(
        this.scratchpadsProvider,
        input.targetFolderId,
        'Target folder not found. Provide a valid targetFolderId.'
      );
    }

    await this.scratchpadsProvider.moveToFolder(input.folderId, input.targetFolderId);
    const updated = getScratchpadFolderOrThrow(this.scratchpadsProvider, input.folderId);

    return resultFromObject({
      success: true,
      movedToRoot: !input.targetFolderId,
      folder: toFolderMetadata(updated)
    });
  }
}

class DeleteScratchpadFolderTool implements vscode.LanguageModelTool<DeleteScratchpadFolderInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DeleteScratchpadFolderInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    getScratchpadFolderOrThrow(this.scratchpadsProvider, input.folderId);

    await this.scratchpadsProvider.deleteFolderForTools(input.folderId);

    return resultFromObject({
      success: true,
      deletedFolderId: input.folderId
    });
  }
}

export function registerScratchpadAiTools(
  context: vscode.ExtensionContext,
  scratchpadsProvider: ScratchpadsProvider
): void {
  context.subscriptions.push(
    vscode.lm.registerTool('codebench_get_scratchpads', new GetScratchpadsTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_get_scratchpad_content', new GetScratchpadContentTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_create_scratchpad', new CreateScratchpadTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_update_scratchpad_content', new UpdateScratchpadContentTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_rename_scratchpad', new RenameScratchpadTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_delete_scratchpad', new DeleteScratchpadTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_create_scratchpad_folder', new CreateScratchpadFolderTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_rename_scratchpad_folder', new RenameScratchpadFolderTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_move_scratchpad_to_folder', new MoveScratchpadToFolderTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_move_scratchpad_folder', new MoveScratchpadFolderTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_delete_scratchpad_folder', new DeleteScratchpadFolderTool(scratchpadsProvider))
  );
}
