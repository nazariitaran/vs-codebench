export interface ScratchFile {
    id: string;
    name: string;
    content: string;
    language?: string;
    createdAt: number;
    lastModified: number;
    order?: number;
    parentId?: string;  // ID of parent folder
}

export interface ScratchpadFolder {
    id: string;
    name: string;
    parentId?: string;  // ID of parent folder (for subfolders)
    createdAt: number;
    updatedAt: number;
    order: number;
    isExpanded?: boolean;
}

export interface ScratchpadData {
    version: number;
    files: ScratchFile[];
    folders?: ScratchpadFolder[];
}

export const CURRENT_SCRATCHPAD_VERSION = 2;
