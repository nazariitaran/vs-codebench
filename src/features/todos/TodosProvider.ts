import * as vscode from 'vscode';
import { TodoTreeItem } from './views/TodoTreeItem';
import { TodoProgressPanel } from './views/TodoProgressPanel';
import { TodoService } from './TodoService';
import TodoValidator from './TodoValidator';

export class TodosProvider implements vscode.TreeDataProvider<TodoTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TodoTreeItem | undefined | void> = new vscode.EventEmitter<TodoTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<TodoTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  private todoService: TodoService;
  private treeView: vscode.TreeView<TodoTreeItem> | undefined;
  private statusBarItem: vscode.StatusBarItem | undefined;

  constructor(private context: vscode.ExtensionContext) {
    this.todoService = new TodoService(context);
    // Don't load todos immediately to avoid race condition
    // loadTodos will be called after setTreeView() is called

    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.loadTodos();
      })
    );
  }

  getTodos() {
    return this.todoService.getTodos();
  }

  getTodoStats() {
    return this.todoService.getTodoStats();
  }

  refresh(): void {
    this.updateTreeViewTitle();
    this._onDidChangeTreeData.fire();

    TodoProgressPanel.updateIfVisible(this.getTodoStats());
  }

  getTreeItem(element: TodoTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: TodoTreeItem): TodoTreeItem | undefined {
    if (!element.todo.parentId) {
      return undefined;
    }

    const parentTodo = this.todoService.findTodo(element.todo.parentId);
    if (parentTodo) {
      parentTodo.children = this.todoService.getSubTodos(parentTodo.id);
      const depth = this.todoService.getTodoDepth(parentTodo.id);
      const isAtMaxDepth = depth >= 3;
      return new TodoTreeItem(parentTodo, isAtMaxDepth);
    }
    return undefined;
  }

  async getChildren(element?: TodoTreeItem): Promise<TodoTreeItem[]> {
    const todos = this.todoService.getTodos();

    const targetTodo = !element ? todos.filter(todo => !todo.parentId) : this.todoService.getSubTodos(element.todo.id);
    return targetTodo.map(todo => {
      todo.children = this.todoService.getSubTodos(todo.id);
      const depth = this.todoService.getTodoDepth(todo.id);
      const isAtMaxDepth = depth >= 3;
      return new TodoTreeItem(todo, isAtMaxDepth);
    });
  }

  async addTodo(text: string, parentId?: string): Promise<void> {
    await this.todoService.addTodo(text, parentId);
    this.refresh();
  }

  async addSubTodo(parentId: string): Promise<void> {
    let inputBoxOpen = true;
    while (inputBoxOpen) {
      const input = await vscode.window.showInputBox({
        prompt: 'Enter sub-todo text',
        placeHolder: 'What needs to be done?',
        validateInput: (value) => TodoValidator.validateText(value)
      });

      if (input === undefined) {
        // User cancelled
        inputBoxOpen = false;
      } else {
        const nestingError = TodoValidator.validateNesting(this.todoService.getTodos(), parentId);
        if (nestingError) {
          vscode.window.showErrorMessage("Maximum nesting depth (3) reached.");
          continue;
        }

        const countError = TodoValidator.validateTotalCount(this.todoService.getTodos());
        if (countError) {
          vscode.window.showErrorMessage(countError);
          continue;
        }

        await this.todoService.addTodo(input, parentId);
        this.refresh();

        if (this.treeView) {
          const parentTodo = this.todoService.findTodo(parentId);
          if (parentTodo) {
            parentTodo.children = this.todoService.getSubTodos(parentTodo.id);
            const depth = this.todoService.getTodoDepth(parentTodo.id);
            const isAtMaxDepth = depth >= 3;
            const parentItem = new TodoTreeItem(parentTodo, isAtMaxDepth);
            await this.treeView.reveal(parentItem, {
              select: false,
              focus: false,
              expand: true
            });
          }
        }
        inputBoxOpen = false;
      }
    }
  }

  async toggleTodoDone(todoItem: TodoTreeItem): Promise<void> {
    await this.todoService.toggleTodo(todoItem.todo.id);
    this.refresh();
  }

  async renameTodo(id: string, text: string): Promise<void> {
    await this.todoService.renameTodo(id, text);
    this.refresh();
  }

  async deleteTodo(id: string): Promise<void> {
    await this.todoService.deleteTodo(id);
    this.refresh();
  }

  async moveTodoUp(id: string): Promise<void> {
    await this.todoService.moveTodoUp(id);
    this.refresh();
  }

  async moveTodoDown(id: string): Promise<void> {
    await this.todoService.moveTodoDown(id);
    this.refresh();
  }

  async clearCheckedTodos(): Promise<void> {
    await this.todoService.clearCheckedTodos();
    this.refresh();
  }

  async clearAllTodos(): Promise<void> {
    await this.todoService.clearAllTodos();
    this.refresh();
  }

  async reorderTodo(draggedId: string, targetId: string): Promise<void> {
    await this.todoService.reorderTodo(draggedId, targetId);
    this.refresh();
  }

  setTreeView(treeView: vscode.TreeView<TodoTreeItem>) {
    this.treeView = treeView;
    // Now that tree view is set, we can safely load todos and update title
    this.loadTodos();

    // Handle checkbox state changes
    this.context.subscriptions.push(
      this.treeView.onDidChangeCheckboxState(async e => {
        // Only update the specific items that were changed
        for (const [item, state] of e.items) {
          const todo = this.todoService.findTodo(item.todo.id);
          if (todo) {
            todo.done = state === vscode.TreeItemCheckboxState.Checked;
            todo.updatedAt = Date.now();
          }
        }
        await this.todoService.saveTodos();
        // Refresh to update strikethrough and counts
        this.refresh();
      })
    );
  }

  private async loadTodos(): Promise<void> {
    await this.todoService.loadTodos();
    this.refresh();
  }

  private updateTreeViewTitle(): void {
    if (this.treeView) {
      const stats = this.getTodoStats();
      this.treeView.title = `Todos`;
      this.treeView.description = `${stats.completed}/${stats.total} completed`;
    }
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    const stats = this.getTodoStats();

    if (!this.statusBarItem) {
      this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
      this.statusBarItem.text = `$(tasklist) ${this.getTodoStats().total} todos`;
      this.statusBarItem.tooltip = 'Click to show todos';
      this.statusBarItem.command = 'todosView.focus';
      this.statusBarItem.show();
      // Add to context subscriptions for proper disposal
      this.context.subscriptions.push(this.statusBarItem);
    }

    if (stats.total === 0) {
      this.statusBarItem.hide();
    } else {
      const percentage = Math.round((stats.completed / stats.total) * 100);

      this.statusBarItem.text = `$(checklist) ${stats.completed}/${stats.total} (${percentage}%)`;
      this.statusBarItem.tooltip = `Todo Progress: ${stats.completed}/${stats.total} completed\nClick to open Todos`;
      this.statusBarItem.show();
    }
  }

  dispose(): void {
    // Dispose the event emitter
    this._onDidChangeTreeData.dispose();
    // Note: All other disposables are managed by context.subscriptions
  }
}
