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
  try {
    registerCursorSupportUnsafe(context, tools);
  } catch (error) {
    console.error('VS CodeBench Cursor integrations failed', error);
  }
}

function registerCursorSupportUnsafe(
  context: vscode.ExtensionContext,
  tools: CodebenchTool[]
): void {
  const cursor = getCursorApi();
  if (!cursor) {
    return;
  }

  if (canRegisterCursorPlugins(cursor) && cursor.plugins) {
    const pluginDir = path.join(context.extensionPath, CODEBENCH_PLUGIN_DIR);
    const plugins = cursor.plugins;
    try {
      plugins.registerPath(pluginDir);
      context.subscriptions.push({
        dispose: () => {
          try {
            plugins.unregisterPath(pluginDir);
          } catch (error) {
            console.error('VS CodeBench Cursor plugin unregister failed', error);
          }
        }
      });
    } catch (error) {
      console.error('VS CodeBench Cursor plugin registration failed', error);
    }
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
      try {
        mcp.unregisterServer(CODEBENCH_MCP_SERVER_NAME);
      } catch (error) {
        console.error('VS CodeBench Cursor MCP unregister failed', error);
      }
      void mcpServer.dispose();
    }
  });

  void mcpServer.start().then(({ url, token }) => {
    if (disposed) {
      void mcpServer.dispose();
      return;
    }

    try {
      mcp.registerServer({
        name: CODEBENCH_MCP_SERVER_NAME,
        server: {
          url,
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });
    } catch (error) {
      console.error('VS CodeBench Cursor MCP server registration failed', error);
      void mcpServer.dispose();
    }
  }).catch(error => {
    console.error('Failed to start VS CodeBench Cursor MCP server', error);
    void mcpServer.dispose();
  });
}
