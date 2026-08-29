import * as path from 'path';
import * as vscode from 'vscode';
import {
  CODEBENCH_MCP_SERVER_NAME,
  CODEBENCH_PLUGIN_DIR,
  canRegisterCursorMcp,
  canRegisterCursorPlugins,
  getCursorApi
} from './cursorApi';
import { CodebenchMcpHttpServer } from './mcpHttpServer';
import { CodebenchTool } from './toolCatalog';

export function registerCursorSupport(
  context: vscode.ExtensionContext,
  tools: CodebenchTool[]
): void {
  const cursor = getCursorApi();
  if (!cursor) {
    return;
  }

  if (canRegisterCursorPlugins(cursor) && cursor.plugins) {
    const pluginDir = path.join(context.extensionPath, CODEBENCH_PLUGIN_DIR);
    cursor.plugins.registerPath(pluginDir);
    context.subscriptions.push({
      dispose: () => cursor.plugins?.unregisterPath(pluginDir)
    });
  }

  if (!canRegisterCursorMcp(cursor) || !cursor.mcp) {
    return;
  }

  const version = context.extension?.packageJSON?.version ?? '0.0.0';
  const mcpServer = new CodebenchMcpHttpServer(tools, version);
  const mcp = cursor.mcp;
  let disposed = false;

  context.subscriptions.push({
    dispose: () => {
      disposed = true;
      mcp.unregisterServer(CODEBENCH_MCP_SERVER_NAME);
      void mcpServer.dispose();
    }
  });

  void mcpServer.start().then(({ url, token }) => {
    if (disposed) {
      void mcpServer.dispose();
      return;
    }

    mcp.registerServer({
      name: CODEBENCH_MCP_SERVER_NAME,
      server: {
        url,
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
  }).catch(error => {
    console.error('Failed to start VS CodeBench Cursor MCP server', error);
  });
}
