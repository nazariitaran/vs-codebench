import { Bookmark } from './Models';

class BookmarkValidator {
  static validateText(text: string): string | null {
    const trimmedText = text.trim();
    const length = Array.from(trimmedText).length;
    if (length < 1 || length > 50) {
      return "Text must be between 1 and 50 characters.";
    }
    return null;
  }

  static validateFolderName(name: string): string | null {
    if (!name || !name.trim()) {
      return 'Folder name cannot be empty';
    }
    if (name.length > 20) {
      return 'Folder name must be less than 20 characters';
    }
    return null;
  }

  static validateTotalCount(bookmarks: Bookmark[]): string | null {
    if (bookmarks.length >= 200) {
      return "Total Bookmark count cannot exceed 200.";
    }
    return null;
  }

  static validateForCreate(params: { text: string, bookmarks: Bookmark[] }): string | null {
    let errorMessage = this.validateText(params.text);
    if (errorMessage) {
      return errorMessage;
    }

    errorMessage = this.validateTotalCount(params.bookmarks);
    if (errorMessage) {
      return errorMessage;
    }

    return null;
  }
}

export default BookmarkValidator;
