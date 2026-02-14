import * as vscode from 'vscode';
import { ScratchpadsProvider } from './ScratchpadsProvider';

interface GetScratchpadsInput {
  language?: string;
  nameContains?: string;
}

interface GetScratchpadContentInput {
  scratchpadId: string;
}

interface CreateScratchpadInput {
  name?: string;
  language?: string;
  content?: string;
}

interface RenameScratchpadInput {
  scratchpadId: string;
  newName: string;
}

interface DeleteScratchpadInput {
  scratchpadId: string;
}

function resultFromObject(payload: unknown): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))
  ]);
}

function toScratchpadMetadata(scratchpad: {
  id: string;
  name: string;
  language?: string;
  createdAt: number;
  lastModified: number;
  order?: number;
}) {
  return {
    id: scratchpad.id,
    name: scratchpad.name,
    language: scratchpad.language,
    createdAt: scratchpad.createdAt,
    lastModified: scratchpad.lastModified,
    order: scratchpad.order
  };
}

class GetScratchpadsTool implements vscode.LanguageModelTool<GetScratchpadsInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetScratchpadsInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input ?? {};
    let scratchpads = this.scratchpadsProvider.getAllScratchpads();

    if (input.language) {
      const language = input.language.toLowerCase();
      scratchpads = scratchpads.filter(file => (file.language ?? '').toLowerCase() === language);
    }

    if (input.nameContains) {
      const nameContains = input.nameContains.toLowerCase();
      scratchpads = scratchpads.filter(file => file.name.toLowerCase().includes(nameContains));
    }

    return resultFromObject({
      count: scratchpads.length,
      scratchpads: scratchpads.map(toScratchpadMetadata)
    });
  }
}

class GetScratchpadContentTool implements vscode.LanguageModelTool<GetScratchpadContentInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetScratchpadContentInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const scratchpad = this.scratchpadsProvider.getScratchpadById(input.scratchpadId);
    if (!scratchpad) {
      throw new Error('Scratchpad not found.');
    }

    const content = this.scratchpadsProvider.getScratchpadContentForTools(input.scratchpadId);

    return resultFromObject({
      scratchpad: {
        ...toScratchpadMetadata(scratchpad),
        content
      }
    });
  }
}

class CreateScratchpadTool implements vscode.LanguageModelTool<CreateScratchpadInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CreateScratchpadInput>
  ): Promise<vscode.LanguageModelToolResult> {
    await this.scratchpadsProvider.createScratchpadForTools(options.input ?? {});

    const scratchpads = this.scratchpadsProvider.getAllScratchpads().map(toScratchpadMetadata);
    return resultFromObject({
      success: true,
      scratchpads
    });
  }
}

class RenameScratchpadTool implements vscode.LanguageModelTool<RenameScratchpadInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RenameScratchpadInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    await this.scratchpadsProvider.renameScratchFileForTools(input.scratchpadId, input.newName);

    const scratchpads = this.scratchpadsProvider.getAllScratchpads().map(toScratchpadMetadata);
    return resultFromObject({
      success: true,
      scratchpads
    });
  }
}

class DeleteScratchpadTool implements vscode.LanguageModelTool<DeleteScratchpadInput> {
  constructor(private scratchpadsProvider: ScratchpadsProvider) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DeleteScratchpadInput>
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    await this.scratchpadsProvider.deleteScratchFileForTools(input.scratchpadId);

    return resultFromObject({
      success: true,
      deletedScratchpadId: input.scratchpadId
    });
  }
}

export function registerScratchpadAiTools(
  context: vscode.ExtensionContext,
  scratchpadsProvider: ScratchpadsProvider
): void {
  context.subscriptions.push(
    vscode.lm.registerTool('codebench_get_scratchpads', new GetScratchpadsTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_get_scratchpad_content', new GetScratchpadContentTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_create_scratchpad', new CreateScratchpadTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_rename_scratchpad', new RenameScratchpadTool(scratchpadsProvider)),
    vscode.lm.registerTool('codebench_delete_scratchpad', new DeleteScratchpadTool(scratchpadsProvider))
  );
}
