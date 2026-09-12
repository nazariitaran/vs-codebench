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
  const mcp = cursor.mcp;
  let disposed = false;
  let mcpDead = false;

  const unregisterMcp = () => {
    try {
      mcp.unregisterServer(CODEBENCH_MCP_SERVER_NAME);
    } catch (error) {
      console.error('VS CodeBench Cursor MCP unregister failed', error);
    }
  };

  const mcpServer = new CodebenchMcpHttpServer(tools, version, () => {
    mcpDead = true;
    unregisterMcp();
  });

  context.subscriptions.push({
    dispose: () => {
      disposed = true;
      unregisterMcp();
      void mcpServer.dispose();
    }
  });

  void mcpServer.start().then(({ url, token }) => {
    if (disposed || mcpDead) {
      void mcpServer.dispose();
      return;
    }

    try {
      // Cursor currently drops `headers` from vscode.cursor.mcp.registerServer
      // (https://forum.cursor.com/t/152267), so also put the loopback
      // session token on the URL. Keep Authorization for when the
      // extension API starts sending headers.
      const registeredUrl = new URL(url);
      registeredUrl.searchParams.set('token', token);

      mcp.registerServer({
        name: CODEBENCH_MCP_SERVER_NAME,
        server: {
          url: registeredUrl.toString(),
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
