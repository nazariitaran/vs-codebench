export interface ScratchFile {
    id: string;
    name: string;
    content: string;
    language?: string;
    createdAt: number;
    lastModified: number;
    order?: number;
}

export interface ScratchpadData {
    version: number;
    files: ScratchFile[];
}

export const CURRENT_SCRATCHPAD_VERSION = 1;
