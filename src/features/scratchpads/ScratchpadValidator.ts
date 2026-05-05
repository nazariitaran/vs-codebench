export default class ScratchpadValidator {
  private static readonly MAX_TOTAL_FILES = 200;
  private static readonly MIN_FOLDER_NAME_LENGTH = 1;
  private static readonly MAX_FOLDER_NAME_LENGTH = 75;
  private static readonly MIN_FILE_NAME_LENGTH = 1;
  private static readonly MAX_FILE_NAME_LENGTH = 75;

  static validateFolderName(name: string): string | null {
    if (!name || name.trim().length === 0) {
      return 'Folder name cannot be empty.';
    }
    const trimmed = name.trim();
    if (trimmed.length < this.MIN_FOLDER_NAME_LENGTH) {
      return `Folder name must be at least ${this.MIN_FOLDER_NAME_LENGTH} character(s).`;
    }
    if (trimmed.length > this.MAX_FOLDER_NAME_LENGTH) {
      return `Folder name must be no more than ${this.MAX_FOLDER_NAME_LENGTH} characters.`;
    }
    if (!/^[a-zA-Z0-9_\-. ]+$/.test(trimmed)) {
      return 'Folder name contains invalid characters.';
    }
    return null;
  }

  static validateTotalCount(files: { id: string }[]): string | null {
    if (files.length >= this.MAX_TOTAL_FILES) {
      return `Maximum of ${this.MAX_TOTAL_FILES} scratchpads reached.`;
    }
    return null;
  }

  static validateFileName(name: string): string | null {
    if (!name || name.trim().length === 0) {
      return 'File name cannot be empty.';
    }
    const trimmed = name.trim();
    if (trimmed.length < this.MIN_FILE_NAME_LENGTH) {
      return `File name must be at least ${this.MIN_FILE_NAME_LENGTH} character(s).`;
    }
    if (trimmed.length > this.MAX_FILE_NAME_LENGTH) {
      return `File name must be no more than ${this.MAX_FILE_NAME_LENGTH} characters.`;
    }
    if (!/^[a-zA-Z0-9_\-. ]+$/.test(trimmed)) {
      return 'File name contains invalid characters.';
    }
    return null;
  }

  static validateForCreate(params: { name?: string; language?: string; content?: string }): string | null {
    if (params.name !== undefined && params.name !== null) {
      return this.validateFileName(params.name);
    }
    return null;
  }
}
