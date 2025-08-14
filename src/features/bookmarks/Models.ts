export interface Bookmark {
    id: string;
    fileUri: string;
    line: number;
    text: string;
    createdAt: number;
    updatedAt: number;
    order: number;
    color?: string; // Color name: 'default' | 'red' | 'green' | 'yellow' | 'purple'
    parentId?: string;  // ID of parent folder
}

export interface BookmarkFolder {
    id: string;
    name: string;
    parentId?: string;  // ID of parent folder (for subfolders)
    createdAt: number;
    updatedAt: number;
    order: number;
    isExpanded?: boolean;
}

export interface BookmarkData {
    version: number;
    bookmarks: Bookmark[];
    folders?: BookmarkFolder[];
}

// Color-related types and constants
export type BookmarkColorName = 'default' | 'red' | 'green' | 'yellow' | 'purple';

export interface BookmarkColor {
  name: BookmarkColorName;
  label: string;
  icon: string;
  hexValue: string; // For backwards compatibility and overview ruler
  themeColor: string; // VS Code theme color for tree view
}

export const BOOKMARK_COLORS: Record<BookmarkColorName, BookmarkColor> = {
  default: {
    name: 'default',
    label: '🔵 VS Code blue',
    icon: 'bookmark-default',
    hexValue: '#007ACC',
    themeColor: 'terminal.ansiBlue'
  },
  red: {
    name: 'red',
    label: '🔴 Red',
    icon: 'bookmark-red',
    hexValue: '#ff0000',
    themeColor: 'errorForeground'
  },
  green: {
    name: 'green',
    label: '🟢 Green',
    icon: 'bookmark-green',
    hexValue: '#00ff00',
    themeColor: 'terminal.ansiGreen'
  },
  yellow: {
    name: 'yellow',
    label: '🟡 Yellow',
    icon: 'bookmark-yellow',
    hexValue: '#ffff00',
    themeColor: 'terminal.ansiYellow'
  },
  purple: {
    name: 'purple',
    label: '🟣 Purple',
    icon: 'bookmark-purple',
    hexValue: '#ff00ff',
    themeColor: 'terminal.ansiMagenta'
  }
};

export function getBookmarkColor(colorName?: string): BookmarkColor {
  if (!colorName || !(colorName in BOOKMARK_COLORS)) {
    return BOOKMARK_COLORS.default;
  }
  return BOOKMARK_COLORS[colorName as BookmarkColorName];
}


export const CURRENT_BOOKMARK_VERSION = 3;
