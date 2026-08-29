import { BookmarksProvider } from '../bookmarks/BookmarksProvider';
import { ScratchpadsProvider } from '../scratchpads/ScratchpadsProvider';
import { TodosProvider } from '../todos/TodosProvider';
import * as bookmarkHandlers from './bookmarkHandlers';
import * as scratchpadHandlers from './scratchpadHandlers';
import * as todoHandlers from './todoHandlers';

export interface CodebenchTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke: (input: Record<string, unknown>) => Promise<unknown>;
}

function asInput<T>(input: Record<string, unknown>): T {
  return input as unknown as T;
}

export interface CodebenchToolDependencies {
  todosProvider: TodosProvider;
  bookmarksProvider: BookmarksProvider;
  scratchpadsProvider: ScratchpadsProvider;
}

export const CODEBENCH_TOOL_NAMES = [
  'codebench_get_todos',
  'codebench_add_todo',
  'codebench_toggle_todo',
  'codebench_rename_todo',
  'codebench_remove_todo',
  'codebench_get_bookmarks',
  'codebench_add_bookmark',
  'codebench_move_bookmark_to_folder',
  'codebench_rename_bookmark',
  'codebench_set_bookmark_color',
  'codebench_remove_bookmark',
  'codebench_create_bookmark_folder',
  'codebench_remove_bookmark_folder',
  'codebench_get_scratchpads',
  'codebench_get_scratchpad_content',
  'codebench_create_scratchpad',
  'codebench_update_scratchpad_content',
  'codebench_rename_scratchpad',
  'codebench_delete_scratchpad',
  'codebench_create_scratchpad_folder',
  'codebench_rename_scratchpad_folder',
  'codebench_move_scratchpad_to_folder',
  'codebench_move_scratchpad_folder',
  'codebench_delete_scratchpad_folder'
] as const;

export function createToolCatalog(deps: CodebenchToolDependencies): CodebenchTool[] {
  return [
    {
      name: 'codebench_get_todos',
      description: 'Get VS CodeBench todos and completion stats for the current workspace. Use this before todo mutations when you need todoId values.',
      inputSchema: {
        type: 'object',
        properties: {
          includeCompleted: {
            type: 'boolean',
            description: 'When false, omit completed todos. Defaults to true.'
          },
          parentId: {
            type: 'string',
            description: 'Optional parent todo ID to list only that todo\'s children.'
          }
        },
        additionalProperties: false
      },
      invoke: input => todoHandlers.getTodos(deps.todosProvider, asInput(input))
    },
    {
      name: 'codebench_add_todo',
      description: 'Create a VS CodeBench todo at root or as a sub-todo. Text is 1-75 characters. Nesting is limited to 2 levels below a root todo.',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: {
            type: 'string',
            description: 'Todo text (1-75 characters).'
          },
          parentId: {
            type: 'string',
            description: 'Optional parent todo ID to create a sub-todo.'
          }
        },
        additionalProperties: false
      },
      invoke: input => todoHandlers.addTodo(deps.todosProvider, asInput(input))
    },
    {
      name: 'codebench_toggle_todo',
      description: 'Toggle the completed state of a VS CodeBench todo by todoId.',
      inputSchema: {
        type: 'object',
        required: ['todoId'],
        properties: {
          todoId: {
            type: 'string',
            description: 'ID of todo to toggle.'
          }
        },
        additionalProperties: false
      },
      invoke: input => todoHandlers.toggleTodo(deps.todosProvider, asInput(input))
    },
    {
      name: 'codebench_rename_todo',
      description: 'Update the text of a VS CodeBench todo by todoId.',
      inputSchema: {
        type: 'object',
        required: ['todoId', 'text'],
        properties: {
          todoId: {
            type: 'string',
            description: 'ID of todo to rename.'
          },
          text: {
            type: 'string',
            description: 'New todo text (1-75 characters).'
          }
        },
        additionalProperties: false
      },
      invoke: input => todoHandlers.renameTodo(deps.todosProvider, asInput(input))
    },
    {
      name: 'codebench_remove_todo',
      description: 'Delete a VS CodeBench todo by todoId. Nested children are also removed.',
      inputSchema: {
        type: 'object',
        required: ['todoId'],
        properties: {
          todoId: {
            type: 'string',
            description: 'ID of todo to delete.'
          }
        },
        additionalProperties: false
      },
      invoke: input => todoHandlers.removeTodo(deps.todosProvider, asInput(input))
    },
    {
      name: 'codebench_get_bookmarks',
      description: 'Get VS CodeBench bookmarks and folders in the current workspace. Use this before bookmark mutations when you need bookmarkId or folderId values.',
      inputSchema: {
        type: 'object',
        properties: {
          fileUri: {
            type: 'string',
            description: 'Absolute file path or file:// URI. Optional filter to return bookmarks only for one file.'
          },
          folderId: {
            type: 'string',
            description: 'Optional folder ID to filter bookmarks by parent folder.'
          },
          includeFolders: {
            type: 'boolean',
            description: 'When true, include folder entries in the response.'
          }
        },
        additionalProperties: false
      },
      invoke: input => bookmarkHandlers.getBookmarks(deps.bookmarksProvider, asInput(input))
    },
    {
      name: 'codebench_add_bookmark',
      description: 'Create a bookmark for a file and line in VS CodeBench. Line is zero-based. Use this for root-level bookmarks.',
      inputSchema: {
        type: 'object',
        required: ['fileUri', 'line'],
        properties: {
          fileUri: {
            type: 'string',
            description: 'Absolute file path or file:// URI for the target file.'
          },
          line: {
            type: 'integer',
            minimum: 0,
            description: 'Zero-based target line number.'
          },
          text: {
            type: 'string',
            description: 'Optional bookmark label (1-75 characters).'
          }
        },
        additionalProperties: false
      },
      invoke: input => bookmarkHandlers.addBookmark(deps.bookmarksProvider, asInput(input))
    },
    {
      name: 'codebench_move_bookmark_to_folder',
      description: 'Place an existing VS CodeBench bookmark into a specific folder. Use get_bookmarks first to resolve bookmarkId and folderId.',
      inputSchema: {
        type: 'object',
        required: ['bookmarkId', 'folderId'],
        properties: {
          bookmarkId: {
            type: 'string',
            description: 'Existing bookmark ID to move into a folder.'
          },
          folderId: {
            type: 'string',
            description: 'Target bookmark folder ID.'
          }
        },
        additionalProperties: false
      },
      invoke: input => bookmarkHandlers.moveBookmarkToFolder(deps.bookmarksProvider, asInput(input))
    },
    {
      name: 'codebench_rename_bookmark',
      description: 'Update the text label for a VS CodeBench bookmark by bookmarkId.',
      inputSchema: {
        type: 'object',
        required: ['bookmarkId', 'text'],
        properties: {
          bookmarkId: {
            type: 'string',
            description: 'ID of bookmark to rename.'
          },
          text: {
            type: 'string',
            description: 'New bookmark label (1-75 characters).'
          }
        },
        additionalProperties: false
      },
      invoke: input => bookmarkHandlers.renameBookmark(deps.bookmarksProvider, asInput(input))
    },
    {
      name: 'codebench_set_bookmark_color',
      description: 'Set bookmark color by bookmarkId. Allowed values are default, red, green, yellow, and purple.',
      inputSchema: {
        type: 'object',
        required: ['bookmarkId', 'color'],
        properties: {
          bookmarkId: {
            type: 'string',
            description: 'ID of bookmark to recolor.'
          },
          color: {
            type: 'string',
            enum: ['default', 'red', 'green', 'yellow', 'purple'],
            description: 'Bookmark color name.'
          }
        },
        additionalProperties: false
      },
      invoke: input => bookmarkHandlers.setBookmarkColor(deps.bookmarksProvider, asInput(input))
    },
    {
      name: 'codebench_remove_bookmark',
      description: 'Delete a VS CodeBench bookmark by bookmarkId.',
      inputSchema: {
        type: 'object',
        required: ['bookmarkId'],
        properties: {
          bookmarkId: {
            type: 'string',
            description: 'ID of bookmark to delete.'
          }
        },
        additionalProperties: false
      },
      invoke: input => bookmarkHandlers.removeBookmark(deps.bookmarksProvider, asInput(input))
    },
    {
      name: 'codebench_create_bookmark_folder',
      description: 'Create a bookmark folder at root or under a parent folder. Folder depth limit is 3.',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            description: 'Folder name (1-75 characters).'
          },
          parentFolderId: {
            type: 'string',
            description: 'Optional parent folder ID.'
          }
        },
        additionalProperties: false
      },
      invoke: input => bookmarkHandlers.createBookmarkFolder(deps.bookmarksProvider, asInput(input))
    },
    {
      name: 'codebench_remove_bookmark_folder',
      description: 'Delete a bookmark folder by folderId. By default this recursively removes all nested subfolders and bookmarks.',
      inputSchema: {
        type: 'object',
        required: ['folderId'],
        properties: {
          folderId: {
            type: 'string',
            description: 'ID of folder to delete.'
          },
          force: {
            type: 'boolean',
            description: 'When false, deletion requires empty folder; when true, delete recursively.'
          }
        },
        additionalProperties: false
      },
      invoke: input => bookmarkHandlers.removeBookmarkFolder(deps.bookmarksProvider, asInput(input))
    },
    {
      name: 'codebench_get_scratchpads',
      description: 'List scratchpad metadata for the current workspace. By default this returns root-level scratchpads only, plus all folder metadata. Use folderId to inspect one folder or includeAll=true to list scratchpads across all folders. This tool does not return scratchpad content.',
      inputSchema: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            description: 'Optional language filter, for example markdown or typescript.'
          },
          nameContains: {
            type: 'string',
            description: 'Optional case-insensitive substring for scratchpad name filtering.'
          },
          folderId: {
            type: 'string',
            description: 'Optional folder ID to filter scratchpads by parent folder.'
          },
          includeAll: {
            type: 'boolean',
            description: 'When true and folderId is omitted, return scratchpads from all folders instead of root-level only.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.getScratchpads(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_get_scratchpad_content',
      description: 'Get the full content of a specific VS CodeBench scratchpad by scratchpadId. Use get_scratchpads first to discover valid IDs.',
      inputSchema: {
        type: 'object',
        required: ['scratchpadId'],
        properties: {
          scratchpadId: {
            type: 'string',
            description: 'ID of scratchpad whose content should be returned.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.getScratchpadContent(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_create_scratchpad',
      description: 'Create a scratchpad with optional name, language, content, and parentFolderId. If name is omitted, a default scratchpad_<n>.<ext> name is generated. Use get_scratchpads first when you need a target folder ID.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Optional file name. If extension is omitted, one is added from language or .txt.'
          },
          language: {
            type: 'string',
            description: 'Optional language id, for example markdown or typescript.'
          },
          content: {
            type: 'string',
            description: 'Optional initial file content.'
          },
          parentFolderId: {
            type: 'string',
            description: 'Optional folder ID to create the scratchpad inside.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.createScratchpad(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_update_scratchpad_content',
      description: 'Update the full file content for an existing VS CodeBench scratchpad by scratchpadId. Use this to overwrite the entire content of a scratchpad.',
      inputSchema: {
        type: 'object',
        required: ['scratchpadId', 'content'],
        properties: {
          scratchpadId: {
            type: 'string',
            description: 'ID of scratchpad to update.'
          },
          content: {
            type: 'string',
            description: 'New content to write to the scratchpad file.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.updateScratchpadContent(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_rename_scratchpad',
      description: 'Rename a VS CodeBench scratchpad by scratchpadId.',
      inputSchema: {
        type: 'object',
        required: ['scratchpadId', 'newName'],
        properties: {
          scratchpadId: {
            type: 'string',
            description: 'ID of scratchpad to rename.'
          },
          newName: {
            type: 'string',
            description: 'New file name for the scratchpad.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.renameScratchpad(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_delete_scratchpad',
      description: 'Delete a VS CodeBench scratchpad by scratchpadId.',
      inputSchema: {
        type: 'object',
        required: ['scratchpadId'],
        properties: {
          scratchpadId: {
            type: 'string',
            description: 'ID of scratchpad to delete.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.deleteScratchpad(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_create_scratchpad_folder',
      description: 'Create a scratchpad folder at root or under a parent folder. Folder depth limit is 5.',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            description: 'Folder name (1-75 characters).'
          },
          parentFolderId: {
            type: 'string',
            description: 'Optional parent folder ID.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.createScratchpadFolder(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_rename_scratchpad_folder',
      description: 'Rename an existing scratchpad folder by folderId. Use get_scratchpads first to discover valid folder IDs.',
      inputSchema: {
        type: 'object',
        required: ['folderId', 'newName'],
        properties: {
          folderId: {
            type: 'string',
            description: 'ID of the scratchpad folder to rename.'
          },
          newName: {
            type: 'string',
            description: 'New folder name.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.renameScratchpadFolder(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_move_scratchpad_to_folder',
      description: 'Place an existing VS CodeBench scratchpad into a specific folder. Use get_scratchpads first to resolve scratchpadId and folderId. Omit folderId to move the scratchpad back to the root.',
      inputSchema: {
        type: 'object',
        required: ['scratchpadId'],
        properties: {
          scratchpadId: {
            type: 'string',
            description: 'Existing scratchpad ID to move into a folder.'
          },
          folderId: {
            type: 'string',
            description: 'Optional target scratchpad folder ID. Omit to move the scratchpad to the root.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.moveScratchpadToFolder(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_move_scratchpad_folder',
      description: 'Move an existing scratchpad folder under another scratchpad folder. Use get_scratchpads first to resolve folder IDs. Omit targetFolderId to move the folder to the root.',
      inputSchema: {
        type: 'object',
        required: ['folderId'],
        properties: {
          folderId: {
            type: 'string',
            description: 'Existing scratchpad folder ID to move.'
          },
          targetFolderId: {
            type: 'string',
            description: 'Optional destination folder ID. Omit to move the folder to the root.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.moveScratchpadFolder(deps.scratchpadsProvider, asInput(input))
    },
    {
      name: 'codebench_delete_scratchpad_folder',
      description: 'Delete a scratchpad folder by folderId. Recursively removes the folder, all nested subfolders, and all contained scratchpads.',
      inputSchema: {
        type: 'object',
        required: ['folderId'],
        properties: {
          folderId: {
            type: 'string',
            description: 'ID of folder to delete.'
          }
        },
        additionalProperties: false
      },
      invoke: input => scratchpadHandlers.deleteScratchpadFolder(deps.scratchpadsProvider, asInput(input))
    }
  ];
}
