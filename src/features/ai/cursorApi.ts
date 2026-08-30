import * as vscode from 'vscode';

export const CODEBENCH_MCP_SERVER_NAME = 'vs-codebench';
export const CODEBENCH_PLUGIN_DIR = 'cursor-plugin';

export interface CursorStdioServerConfig {
  name: string;
  server: {
    command: string;
    args: string[];
    env: Record<string, string>;
  };
}

export interface CursorRemoteServerConfig {
  name: string;
  server: {
    url: string;
    headers?: Record<string, string>;
  };
}

export type CursorMcpServerConfig = CursorStdioServerConfig | CursorRemoteServerConfig;

export interface CursorMcpApi {
  registerServer: (config: CursorMcpServerConfig) => void;
  unregisterServer: (serverName: string) => void;
}

export interface CursorPluginsApi {
  registerPath: (pluginPath: string) => void;
  unregisterPath: (pluginPath: string) => void;
}

export interface CursorApi {
  mcp?: CursorMcpApi;
  plugins?: CursorPluginsApi;
}

export function getCursorApi(): CursorApi | undefined {
  const cursor = (vscode as unknown as { cursor?: CursorApi }).cursor;
  if (!cursor) {
    return undefined;
  }
  return cursor;
}

export function canRegisterCursorMcp(cursor: CursorApi | undefined): boolean {
  return typeof cursor?.mcp?.registerServer === 'function'
    && typeof cursor?.mcp?.unregisterServer === 'function';
}

export function canRegisterCursorPlugins(cursor: CursorApi | undefined): boolean {
  return typeof cursor?.plugins?.registerPath === 'function'
    && typeof cursor?.plugins?.unregisterPath === 'function';
}
