import * as http from 'http';
import { AddressInfo } from 'net';
import { randomBytes } from 'crypto';
import { CodebenchTool } from './toolCatalog';

const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'];
const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export interface McpServerInfo {
  url: string;
  token: string;
}

export class CodebenchMcpHttpServer {
  private server: http.Server | undefined;
  private token = '';
  private readonly toolsByName: Map<string, CodebenchTool>;
  private readonly sseResponses = new Set<http.ServerResponse>();

  constructor(
    tools: CodebenchTool[],
    private readonly serverVersion: string
  ) {
    this.toolsByName = new Map(tools.map(tool => [tool.name, tool]));
  }

  async start(): Promise<McpServerInfo> {
    if (this.server) {
      const address = this.server.address() as AddressInfo;
      return {
        url: `http://127.0.0.1:${address.port}/mcp`,
        token: this.token
      };
    }

    this.token = randomBytes(32).toString('hex');
    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(0, '127.0.0.1', () => resolve());
    });

    const address = this.server.address() as AddressInfo;
    return {
      url: `http://127.0.0.1:${address.port}/mcp`,
      token: this.token
    };
  }

  async dispose(): Promise<void> {
    for (const res of this.sseResponses) {
      res.end();
    }
    this.sseResponses.clear();

    const server = this.server;
    this.server = undefined;
    if (!server) {
      return;
    }

    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/mcp') {
      writeJson(res, 404, { error: 'Not found' });
      return;
    }

    if (!this.isAuthorized(req)) {
      writeJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (req.method === 'GET') {
      this.handleSse(res);
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'GET, POST' });
      res.end();
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      writeJson(res, 400, jsonRpcError(null, -32700, errorMessage(error, 'Parse error')));
      return;
    }

    if (Array.isArray(body)) {
      const responses: JsonRpcResponse[] = [];
      for (const item of body) {
        const response = await this.handleRpc(item);
        if (response) {
          responses.push(response);
        }
      }
      writeJson(res, 200, responses);
      return;
    }

    const response = await this.handleRpc(body);
    if (!response) {
      res.writeHead(202);
      res.end();
      return;
    }

    writeJson(res, 200, response);
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    const header = req.headers.authorization;
    return header === `Bearer ${this.token}`;
  }

  private handleSse(res: http.ServerResponse): void {
    this.sseResponses.add(res);
    res.on('close', () => this.sseResponses.delete(res));
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(':\n\n');
  }

  private async handleRpc(raw: unknown): Promise<JsonRpcResponse | undefined> {
    const request = raw as JsonRpcRequest;
    const id = request?.id ?? null;
    const isNotification = request?.id === undefined;

    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return jsonRpcError(id, -32600, 'Invalid Request');
    }

    try {
      const result = await this.dispatch(request.method, request.params);
      if (isNotification) {
        return undefined;
      }
      return {
        jsonrpc: '2.0',
        id,
        result
      };
    } catch (error) {
      if (isNotification) {
        return undefined;
      }
      if (error instanceof MethodNotFoundError) {
        return jsonRpcError(id, -32601, error.message);
      }
      return jsonRpcError(id, -32603, errorMessage(error, 'Internal error'));
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.initialize(params);
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return {};
      case 'ping':
        return {};
      case 'tools/list':
        return {
          tools: [...this.toolsByName.values()].map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        };
      case 'tools/call':
        return this.callTool(params);
      default:
        throw jsonRpcMethodNotFound(method);
    }
  }

  private initialize(params: unknown): unknown {
    const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
    const protocolVersion = requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
      ? requested
      : DEFAULT_PROTOCOL_VERSION;

    return {
      protocolVersion,
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'vs-codebench',
        version: this.serverVersion
      },
      instructions: 'VS CodeBench tools manage workspace-scoped todos, bookmarks, and scratchpads. Use get_* tools to resolve IDs before mutations. Scratchpad content is not in the git workspace; read it with codebench_get_scratchpad_content.'
    };
  }

  private async callTool(params: unknown): Promise<unknown> {
    const call = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    if (!call?.name) {
      throw new Error('Tool name is required.');
    }

    const tool = this.toolsByName.get(call.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${call.name}` }],
        isError: true
      };
    }

    try {
      const payload = await tool.invoke(call.arguments ?? {});
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        isError: false
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: errorMessage(error, 'Tool failed.') }],
        isError: true
      };
    }
  }
}

class MethodNotFoundError extends Error {
  readonly method: string;

  constructor(method: string) {
    super(`Method not found: ${method}`);
    this.method = method;
  }
}

function jsonRpcMethodNotFound(method: string): MethodNotFoundError {
  return new MethodNotFoundError(method);
}

function jsonRpcError(id: string | number | null, code: number, message: string): JsonRpcFailure {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message }
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof MethodNotFoundError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim().length === 0) {
    return {};
  }
  return JSON.parse(raw);
}
