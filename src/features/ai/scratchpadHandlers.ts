import { ScratchpadsProvider } from '../scratchpads/ScratchpadsProvider';
import ScratchpadValidator from '../scratchpads/ScratchpadValidator';

export interface GetScratchpadsInput {
  language?: string;
  nameContains?: string;
  folderId?: string;
  includeAll?: boolean;
}

export interface GetScratchpadContentInput {
  scratchpadId: string;
}

export interface CreateScratchpadInput {
  name?: string;
  language?: string;
  content?: string;
  parentFolderId?: string;
}

export interface RenameScratchpadInput {
  scratchpadId: string;
  newName: string;
}

export interface UpdateScratchpadContentInput {
  scratchpadId: string;
  content: string;
}

export interface DeleteScratchpadInput {
  scratchpadId: string;
}

export interface CreateScratchpadFolderInput {
  name: string;
  parentFolderId?: string;
}

export interface RenameScratchpadFolderInput {
  folderId: string;
  newName: string;
}

export interface MoveScratchpadToFolderInput {
  scratchpadId: string;
  folderId?: string;
}

export interface MoveScratchpadFolderInput {
  folderId: string;
  targetFolderId?: string;
}

export interface DeleteScratchpadFolderInput {
  folderId: string;
}

export function toScratchpadMetadata(scratchpad: {
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

export function toFolderMetadata(folder: {
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

export async function getScratchpads(scratchpadsProvider: ScratchpadsProvider, input: GetScratchpadsInput = {}) {
  let scratchpads = scratchpadsProvider.getAllScratchpads();
  const includeAll = input.includeAll ?? false;

  if (input.folderId !== undefined) {
    getScratchpadFolderOrThrow(scratchpadsProvider, input.folderId);
    scratchpads = scratchpads.filter(file => file.parentId === input.folderId);
  } else if (!includeAll) {
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

  const folders = scratchpadsProvider.scratchpadService.getFolders();

  return {
    scope: input.folderId !== undefined ? 'folder' : includeAll ? 'all' : 'root',
    count: scratchpads.length,
    scratchpads: scratchpads.map(toScratchpadMetadata),
    folders: folders.map(toFolderMetadata)
  };
}

export async function getScratchpadContent(scratchpadsProvider: ScratchpadsProvider, input: GetScratchpadContentInput) {
  const scratchpad = scratchpadsProvider.getScratchpadById(input.scratchpadId);
  if (!scratchpad) {
    throw new Error('Scratchpad not found.');
  }

  const content = scratchpadsProvider.getScratchpadContentForTools(input.scratchpadId);

  return {
    scratchpad: {
      ...toScratchpadMetadata(scratchpad),
      content
    }
  };
}

export async function createScratchpad(scratchpadsProvider: ScratchpadsProvider, input: CreateScratchpadInput = {}) {
  const validationError = ScratchpadValidator.validateForCreate(input);
  if (validationError) {
    throw new Error(validationError);
  }

  if (input.parentFolderId) {
    getScratchpadFolderOrThrow(
      scratchpadsProvider,
      input.parentFolderId,
      'Parent folder not found. Provide a valid parentFolderId.'
    );
  }

  await scratchpadsProvider.createScratchpadForTools(input);

  return {
    success: true,
    scratchpads: scratchpadsProvider.getAllScratchpads().map(toScratchpadMetadata)
  };
}

export async function updateScratchpadContent(scratchpadsProvider: ScratchpadsProvider, input: UpdateScratchpadContentInput) {
  const scratchpad = scratchpadsProvider.getScratchpadById(input.scratchpadId);
  if (!scratchpad) {
    throw new Error('Scratchpad not found. Provide a valid scratchpadId.');
  }

  await scratchpadsProvider.updateScratchpadContentForTools(input.scratchpadId, input.content);
  const content = scratchpadsProvider.getScratchpadContentForTools(input.scratchpadId);

  return {
    success: true,
    scratchpad: {
      ...toScratchpadMetadata(scratchpad),
      content
    }
  };
}

export async function renameScratchpad(scratchpadsProvider: ScratchpadsProvider, input: RenameScratchpadInput) {
  await scratchpadsProvider.renameScratchFileForTools(input.scratchpadId, input.newName);

  return {
    success: true,
    scratchpads: scratchpadsProvider.getAllScratchpads().map(toScratchpadMetadata)
  };
}

export async function deleteScratchpad(scratchpadsProvider: ScratchpadsProvider, input: DeleteScratchpadInput) {
  await scratchpadsProvider.deleteScratchFileForTools(input.scratchpadId);

  return {
    success: true,
    deletedScratchpadId: input.scratchpadId
  };
}

export async function createScratchpadFolder(scratchpadsProvider: ScratchpadsProvider, input: CreateScratchpadFolderInput) {
  const validationError = ScratchpadValidator.validateFolderName(input.name);
  if (validationError) {
    throw new Error(validationError);
  }

  if (input.parentFolderId) {
    const parentFolder = getScratchpadFolderOrThrow(
      scratchpadsProvider,
      input.parentFolderId,
      'Parent folder not found. Provide a valid parentFolderId.'
    );
    const parentDepth = scratchpadsProvider.scratchpadService.getFolderDepth(parentFolder.id);
    if (parentDepth >= 5) {
      throw new Error('Maximum folder depth (5 levels) reached.');
    }
  }

  const folder = await scratchpadsProvider.addFolder(input.name, input.parentFolderId);

  return {
    success: true,
    folder: toFolderMetadata(folder)
  };
}

export async function renameScratchpadFolder(scratchpadsProvider: ScratchpadsProvider, input: RenameScratchpadFolderInput) {
  const folder = getScratchpadFolderOrThrow(scratchpadsProvider, input.folderId);

  const validationError = ScratchpadValidator.validateFolderName(input.newName);
  if (validationError) {
    throw new Error(validationError);
  }

  await scratchpadsProvider.editFolder(input.folderId, input.newName);
  const updated = getScratchpadFolderOrThrow(scratchpadsProvider, input.folderId);

  return {
    success: true,
    folder: toFolderMetadata(updated),
    previousName: folder.name
  };
}

export async function moveScratchpadToFolder(scratchpadsProvider: ScratchpadsProvider, input: MoveScratchpadToFolderInput) {
  const scratchpad = scratchpadsProvider.scratchpadService.getScratchFile(input.scratchpadId);
  if (!scratchpad) {
    throw new Error('Scratchpad not found. Provide a valid scratchpadId.');
  }

  if (input.folderId) {
    getScratchpadFolderOrThrow(scratchpadsProvider, input.folderId);
  }

  await scratchpadsProvider.moveToFolder(input.scratchpadId, input.folderId);
  const updated = scratchpadsProvider.scratchpadService.getScratchFile(input.scratchpadId);

  return {
    success: true,
    movedToRoot: !input.folderId,
    scratchpad: updated ? toScratchpadMetadata(updated) : undefined
  };
}

export async function moveScratchpadFolder(scratchpadsProvider: ScratchpadsProvider, input: MoveScratchpadFolderInput) {
  getScratchpadFolderOrThrow(scratchpadsProvider, input.folderId);

  if (input.targetFolderId) {
    getScratchpadFolderOrThrow(
      scratchpadsProvider,
      input.targetFolderId,
      'Target folder not found. Provide a valid targetFolderId.'
    );
  }

  await scratchpadsProvider.moveToFolder(input.folderId, input.targetFolderId);
  const updated = getScratchpadFolderOrThrow(scratchpadsProvider, input.folderId);

  return {
    success: true,
    movedToRoot: !input.targetFolderId,
    folder: toFolderMetadata(updated)
  };
}

export async function deleteScratchpadFolder(scratchpadsProvider: ScratchpadsProvider, input: DeleteScratchpadFolderInput) {
  getScratchpadFolderOrThrow(scratchpadsProvider, input.folderId);
  await scratchpadsProvider.deleteFolderForTools(input.folderId);

  return {
    success: true,
    deletedFolderId: input.folderId
  };
}
