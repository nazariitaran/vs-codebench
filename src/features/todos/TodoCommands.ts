import * as vscode from 'vscode';
import { TodosProvider } from './TodosProvider';
import { TodoTreeItem } from './views/TodoTreeItem';
import { TodoProgressPanel } from './views/TodoProgressPanel';
import TodoValidator from './TodoValidator';

export function registerTodoCommands(
  context: vscode.ExtensionContext,
  todosProvider: TodosProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('vs-codebench.addTodo', async () => {
      const todos = todosProvider.getTodos();
      const countError = TodoValidator.validateTotalCount(todos);
      if (countError) {
        vscode.window.showErrorMessage(countError);
        return;
      }

      let inputBoxOpen = true;
      while (inputBoxOpen) {
        const input = await vscode.window.showInputBox({
          prompt: 'Enter todo text',
          placeHolder: 'What needs to be done?',
          validateInput: (value) => {
            return TodoValidator.validateText(value);
          }
        });

        if (input === undefined) {
          // User cancelled
          inputBoxOpen = false;
        } else if (input) {
          // Check count again in case it changed
          const currentTodos = todosProvider.getTodos();
          const currentCountError = TodoValidator.validateTotalCount(currentTodos);
          if (currentCountError) {
            vscode.window.showErrorMessage(currentCountError);
            // Keep the input box open by continuing the loop
          } else {
            // Validation passed, create the todo
            await todosProvider.addTodo(input);
            inputBoxOpen = false;
          }
        }
      }
    }),

    vscode.commands.registerCommand('vs-codebench.editTodo', async (item: any) => {
      if (item && item.todo) {
        const input = await vscode.window.showInputBox({
          prompt: 'Edit todo text',
          value: item.todo.text
        });
        if (input !== undefined) {
          await todosProvider.renameTodo(item.todo.id, input);
        }
      }
    }),

    vscode.commands.registerCommand('vs-codebench.deleteTodo', async (item: any) => {
      if (item && item.todo) {
        await todosProvider.deleteTodo(item.todo.id);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.moveTodoUp', async (item: any) => {
      if (item && item.todo) {
        await todosProvider.moveTodoUp(item.todo.id);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.moveTodoDown', async (item: any) => {
      if (item && item.todo) {
        await todosProvider.moveTodoDown(item.todo.id);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.addSubTodo', async (item: any) => {
      if (item && item.todo) {
        await todosProvider.addSubTodo(item.todo.id);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.showTodoStats', async () => {
      const stats = todosProvider.getTodoStats();
      TodoProgressPanel.createOrShow(context.extensionUri, stats);
    }),

    vscode.commands.registerCommand('vs-codebench.toggleTodo', async (item: any) => {
      if (item && item instanceof TodoTreeItem) {
        await todosProvider.toggleTodoDone(item);
      }
    }),

    vscode.commands.registerCommand('vs-codebench.clearCheckedTodos', async () => {
      const stats = todosProvider.getTodoStats();
      if (stats.completed === 0) {
        vscode.window.showInformationMessage('There are no checked todos to remove.');
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Remove ${stats.completed} checked todo${stats.completed !== 1 ? 's' : ''}?`,
        { modal: true },
        'Remove'
      );
      if (confirm === 'Remove') {
        await todosProvider.clearCheckedTodos();
      }
    }),

    vscode.commands.registerCommand('vs-codebench.clearAllTodos', async () => {
      const stats = todosProvider.getTodoStats();
      if (stats.total === 0) {
        vscode.window.showInformationMessage('There are no todos to clear.');
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Clear all ${stats.total} todo${stats.total !== 1 ? 's' : ''}? This cannot be undone.`,
        { modal: true },
        'Clear All'
      );
      if (confirm === 'Clear All') {
        await todosProvider.clearAllTodos();
      }
    })
  );
}
