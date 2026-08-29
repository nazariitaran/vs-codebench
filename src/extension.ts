import * as vscode from 'vscode';

import { TodosProvider, registerTodoCommands } from './features/todos';
import { BookmarksProvider, registerBookmarkCommands } from './features/bookmarks';
import { ScratchpadFileSystemProvider, ScratchpadsProvider, registerScratchpadCommands } from './features/scratchpads';
import { SCRATCHPAD_URI_SCHEME } from './features/scratchpads/ScratchpadService';
import { registerAiIntegrations } from './features/ai';

import { TodoDragAndDropController } from './features/todos/views/TodoDragAndDropController';
import { BookmarkDragAndDropController } from './features/bookmarks/views/BookmarkDragAndDropController';
import { ScratchpadDragAndDropController } from './features/scratchpads/views/ScratchpadDragAndDropController';

export function activate(context: vscode.ExtensionContext) {
  const todosProvider = new TodosProvider(context);
  const bookmarksProvider = new BookmarksProvider(context);
  const scratchpadsProvider = new ScratchpadsProvider(context);
  const scratchpadFileSystemProvider = new ScratchpadFileSystemProvider(scratchpadsProvider);

  const todosTreeView = vscode.window.createTreeView('todosView', {
    treeDataProvider: todosProvider,
    showCollapseAll: false,
    canSelectMany: false,
    dragAndDropController: new TodoDragAndDropController(todosProvider)
  });
  todosProvider.setTreeView(todosTreeView);

  const bookmarksTreeView = vscode.window.createTreeView('bookmarksView', {
    treeDataProvider: bookmarksProvider,
    showCollapseAll: false,
    canSelectMany: false,
    dragAndDropController: new BookmarkDragAndDropController(bookmarksProvider)
  });
  bookmarksProvider.setTreeView(bookmarksTreeView);

  const scratchpadsTreeView = vscode.window.createTreeView('scratchpadsView', {
    treeDataProvider: scratchpadsProvider,
    showCollapseAll: false,
    canSelectMany: false,
    dragAndDropController: new ScratchpadDragAndDropController(scratchpadsProvider)
  });

  context.subscriptions.push(
    todosTreeView,
    bookmarksTreeView,
    scratchpadsTreeView,
    vscode.workspace.registerFileSystemProvider(SCRATCHPAD_URI_SCHEME, scratchpadFileSystemProvider, {
      isCaseSensitive: true,
      isReadonly: false
    })
  );

  context.subscriptions.push({
    dispose: () => {
      todosProvider.dispose();
      bookmarksProvider.dispose();
      scratchpadsProvider.dispose();
    }
  });

  registerTodoCommands(context, todosProvider);
  registerBookmarkCommands(context, bookmarksProvider);
  registerScratchpadCommands(context, scratchpadsProvider);
  registerAiIntegrations(context, todosProvider, bookmarksProvider, scratchpadsProvider);

  return {
    todosProvider,
    bookmarksProvider,
    scratchpadsProvider
  };
}

export async function deactivate(): Promise<void> {
  // VS Code automatically disposes all items in context.subscriptions,
  // but you can add explicit cleanup here if needed:

  // Example: Save any pending state
  // await saveApplicationState();

  // Example: Close any external connections
  // await closeExternalConnections();

  // Example: Clean up temporary files
  // await cleanupTempFiles();

  // Return a promise to ensure all async cleanup completes
  console.log('VS CodeBench extension is being deactivated');
  return Promise.resolve();
}
