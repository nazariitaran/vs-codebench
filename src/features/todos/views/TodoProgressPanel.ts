import * as vscode from 'vscode';

export class TodoProgressPanel {
  private static currentPanel: TodoProgressPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, stats: { total: number; completed: number; remaining: number; rootCount: number; subTodoCount: number }) {
    const column = vscode.ViewColumn.One;

    if (TodoProgressPanel.currentPanel) {
      TodoProgressPanel.currentPanel._panel.reveal(column);
      TodoProgressPanel.currentPanel.update(stats);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'todoProgress',
      'Todo Progress',
      column,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri]
      }
    );

    TodoProgressPanel.currentPanel = new TodoProgressPanel(panel, extensionUri, stats);
  }
    
  public static updateIfVisible(stats: { total: number; completed: number; remaining: number; rootCount: number; subTodoCount: number }) {
    if (TodoProgressPanel.currentPanel) {
      TodoProgressPanel.currentPanel.update(stats);
    }
  }

  private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri, stats: { total: number; completed: number; remaining: number; rootCount: number; subTodoCount: number }) {
    this._panel = panel;

    this.update(stats);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public update(stats: { total: number; completed: number; remaining: number; rootCount: number; subTodoCount: number }) {
    this._panel.webview.html = this._getHtmlForWebview(stats);
  }

  private _getHtmlForWebview(stats: { total: number; completed: number; remaining: number; rootCount: number; subTodoCount: number }) {
    const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    const hasTodos = stats.total > 0;

    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Todo Progress</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                    }
                    .progress-container {
                        max-width: 600px;
                        margin: 0 auto;
                    }
                    h1 {
                        text-align: center;
                        color: var(--vscode-foreground);
                        font-weight: 600;
                        font-size: 18px;
                        margin-bottom: 12px;
                    }
                    .progress-bar-container {
                        background-color: var(--vscode-progressBar-background);
                        border-radius: 10px;
                        padding: 3px;
                        margin: 20px 0;
                        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
                    }
                    .progress-bar {
                        display: block;
                        height: 30px;
                        background-color: var(--vscode-progressBar-background);
                        border-radius: 7px;
                        transition: width 0.5s ease-in-out;
                        background-image: linear-gradient(
                            to right,
                            var(--vscode-button-background),
                            var(--vscode-button-hoverBackground)
                        );
                    }
                    .stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 20px;
                        margin-top: 30px;
                    }
                    .stat-card {
                        background-color: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 8px;
                        padding: 15px;
                        text-align: center;
                    }
                    .stat-number {
                        font-size: 2em;
                        font-weight: bold;
                        color: var(--vscode-button-background);
                    }
                    .stat-label {
                        color: var(--vscode-descriptionForeground);
                        margin-top: 5px;
                    }
                    .percentage {
                        text-align: center;
                        font-size: 1.5em;
                        margin: 10px 0;
                        color: var(--vscode-foreground);
                    }
                    .empty-state {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 24px;
                        margin-top: 24px;
                        border: 1px dashed var(--vscode-panel-border);
                        border-radius: 8px;
                        color: var(--vscode-descriptionForeground);
                        background: transparent;
                    }
                    .empty-icon {
                        font-size: 28px;
                        opacity: 0.8;
                    }
                    .empty-title {
                        font-size: 14px;
                        font-weight: 600;
                        color: var(--vscode-foreground);
                    }
                    .empty-hint {
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="progress-container">
                    <h1>📊 Todo Progress</h1>
                    ${hasTodos ? `
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${percentage}%;"></div>
                    </div>
                    <div class="percentage">${percentage}% Complete</div>

                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-number">${stats.total}</div>
                            <div class="stat-label">Total Tasks</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">✅ ${stats.completed}</div>
                            <div class="stat-label">Completed</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">⏳ ${stats.remaining}</div>
                            <div class="stat-label">Remaining</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">📋 ${stats.rootCount}</div>
                            <div class="stat-label">Main Tasks</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">🔗 ${stats.subTodoCount}</div>
                            <div class="stat-label">Sub-tasks</div>
                        </div>
                    </div>
                    ` : `
                    <div class="empty-state">
                        <div class="empty-icon">🗒️</div>
                        <div class="empty-title">No todos yet</div>
                        <div class="empty-hint">Add a TODO comment in your code to get started.</div>
                    </div>
                    `}
                </div>
            </body>
            </html>`;
  }

  public dispose() {
    TodoProgressPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
