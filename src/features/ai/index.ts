import * as vscode from 'vscode';
import { BookmarksProvider } from '../bookmarks/BookmarksProvider';
import { ScratchpadsProvider } from '../scratchpads/ScratchpadsProvider';
import { TodosProvider } from '../todos/TodosProvider';
import { registerCursorSupport } from './cursorSupport';
import { registerLanguageModelTools } from './languageModelTools';
import { createToolCatalog } from './toolCatalog';

export { canRegisterLanguageModelTools } from './languageModelTools';
export { canRegisterCursorMcp, canRegisterCursorPlugins, getCursorApi } from './cursorApi';
export { CODEBENCH_MCP_SERVER_NAME } from './cursorApi';
export { CodebenchMcpHttpServer } from './mcpHttpServer';
export { createToolCatalog, CODEBENCH_TOOL_NAMES } from './toolCatalog';

export function registerAiIntegrations(
  context: vscode.ExtensionContext,
  todosProvider: TodosProvider,
  bookmarksProvider: BookmarksProvider,
  scratchpadsProvider: ScratchpadsProvider
): void {
  const tools = createToolCatalog({
    todosProvider,
    bookmarksProvider,
    scratchpadsProvider
  });

  registerLanguageModelTools(context, tools);
  registerCursorSupport(context, tools);
}
