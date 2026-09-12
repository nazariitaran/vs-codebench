import * as vscode from 'vscode';
import { CodebenchTool } from './toolCatalog';

export function canRegisterLanguageModelTools(
  lm: { registerTool?: unknown } | undefined
): boolean {
  try {
    return typeof lm?.registerTool === 'function';
  } catch {
    return false;
  }
}

function getLanguageModelApi(): typeof vscode.lm | undefined {
  try {
    return vscode.lm;
  } catch {
    return undefined;
  }
}

function resultFromObject(payload: unknown): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))
  ]);
}

class CatalogLanguageModelTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  constructor(private tool: CodebenchTool) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>
  ): Promise<vscode.LanguageModelToolResult> {
    const payload = await this.tool.invoke(options.input ?? {});
    return resultFromObject(payload);
  }
}

export function registerLanguageModelTools(
  context: vscode.ExtensionContext,
  tools: CodebenchTool[]
): void {
  const lm = getLanguageModelApi();
  if (!canRegisterLanguageModelTools(lm) || !lm) {
    return;
  }

  try {
    for (const tool of tools) {
      context.subscriptions.push(
        lm.registerTool(tool.name, new CatalogLanguageModelTool(tool))
      );
    }
  } catch (error) {
    console.error('VS CodeBench language model tools failed', error);
  }
}
