import * as vscode from 'vscode';
import { Todo } from '../Models';

export class TodoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly todo: Todo,
    public readonly isAtMaxDepth: boolean = false
  ) {
    const collapsibleState = todo.children && todo.children.length > 0
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;

    // Apply strikethrough effect for completed todos
    const label = todo.done ? TodoTreeItem.strikethrough(todo.text) : todo.text;
    super(label, collapsibleState);

    this.id = todo.id;

    // Enhanced tooltip with sub-todo information
    let tooltipText = `Created: ${new Date(todo.createdAt).toLocaleString()}`;
    if (todo.children && todo.children.length > 0) {
      const completedSubTodos = todo.children.filter((child: Todo) => child.done).length;
      tooltipText += `\nSub-todos: ${completedSubTodos} completed, ${todo.children.length - completedSubTodos} remaining`;
    }
    this.tooltip = tooltipText;

    this.checkboxState = todo.done
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;

    // Set context value for commands
    this.contextValue = isAtMaxDepth ? 'todoItemMaxDepth' : 'todoItem';
  }

  private static strikethrough(text: string): string {
    // Use combining long stroke overlay character for strikethrough effect
    return text.split('').map(char => char + '\u0336').join('');
  }
}
