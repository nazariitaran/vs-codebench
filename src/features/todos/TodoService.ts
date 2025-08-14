import { Todo, TodoData, TodoStats, CURRENT_TODO_VERSION } from './Models';
import { StorageService, createNamespacedStorage, NamespacedStorageService } from '../../common/storage/StorageService';
import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';

export class TodoService {
  private todos: Todo[] = [];
  private storage: NamespacedStorageService;

  constructor(context: vscode.ExtensionContext) {
    this.storage = createNamespacedStorage(context, 'todos');
  }

  getTodos(): Todo[] {
    return this.todos;
  }

  getTodoStats(): TodoStats {
    const total = this.todos.length;
    const completed = this.todos.filter(todo => todo.done).length;
    const remaining = total - completed;
    const rootCount = this.todos.filter(todo => !todo.parentId).length;
    const subTodoCount = this.todos.filter(todo => todo.parentId).length;

    return { total, completed, remaining, rootCount, subTodoCount };
  }

  async loadTodos(): Promise<void> {
    const data = await this.storage.retrieve<TodoData>('data', {
      version: CURRENT_TODO_VERSION,
      todos: []
    }, { scope: 'auto' });
    this.todos = data.todos;
  }

  async saveTodos(): Promise<void> {
    await this.storage.store('data', {
      version: CURRENT_TODO_VERSION,
      todos: this.todos
    }, { scope: 'auto' });
  }

  async addTodo(text: string, parentId?: string): Promise<Todo> {
    const newTodo: Todo = {
      id: uuidv4(),
      text: text.trim(),
      done: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: this.todos.length,
      parentId: parentId
    };
    this.todos.push(newTodo);
    await this.saveTodos();
    return newTodo;
  }

  async toggleTodo(id: string): Promise<void> {
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      todo.done = !todo.done;
      todo.updatedAt = Date.now();
      await this.saveTodos();
    }
  }

  async renameTodo(id: string, text: string): Promise<void> {
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      todo.text = text.trim();
      todo.updatedAt = Date.now();
      await this.saveTodos();
    }
  }

  async deleteTodo(id: string): Promise<void> {
    const deleteRecursive = (todoId: string) => {
      const children = this.todos.filter(t => t.parentId === todoId);
      children.forEach(child => deleteRecursive(child.id));
      this.todos = this.todos.filter(t => t.id !== todoId);
    };

    deleteRecursive(id);
    await this.saveTodos();
  }

  async clearCheckedTodos(): Promise<void> {
    const toDelete = new Set<string>();

    const markForDeletion = (todoId: string) => {
      toDelete.add(todoId);
      const children = this.todos.filter(t => t.parentId === todoId);
      for (const child of children) {
        markForDeletion(child.id);
      }
    };

    for (const t of this.todos) {
      if (t.done) {
        markForDeletion(t.id);
      }
    }

    if (toDelete.size === 0) {
      return;
    }

    this.todos = this.todos.filter(t => !toDelete.has(t.id));
    await this.saveTodos();
  }

  async clearAllTodos(): Promise<void> {
    if (this.todos.length === 0) {
      return;
    }
    this.todos = [];
    await this.saveTodos();
  }

  async moveTodoUp(id: string): Promise<void> {
    const index = this.todos.findIndex(t => t.id === id);
    if (index > 0) {
      [this.todos[index], this.todos[index - 1]] = [this.todos[index - 1], this.todos[index]];
      await this.saveTodos();
    }
  }

  async moveTodoDown(id: string): Promise<void> {
    const index = this.todos.findIndex(t => t.id === id);
    if (index < this.todos.length - 1) {
      [this.todos[index], this.todos[index + 1]] = [this.todos[index + 1], this.todos[index]];
      await this.saveTodos();
    }
  }

  async reorderTodo(draggedId: string, targetId: string): Promise<void> {
    const draggedIndex = this.todos.findIndex(t => t.id === draggedId);
    const targetIndex = this.todos.findIndex(t => t.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const [draggedTodo] = this.todos.splice(draggedIndex, 1);
    this.todos.splice(targetIndex, 0, draggedTodo);

    this.todos.forEach((todo, index) => {
      todo.order = index;
    });

    await this.saveTodos();
  }

  getSubTodos(parentId: string): Todo[] {
    return this.todos.filter(t => t.parentId === parentId);
  }

  findTodo(id: string): Todo | undefined {
    return this.todos.find(t => t.id === id);
  }

  getTodoDepth(id: string): number {
    let depth = 0;
    let current = this.findTodo(id);
    while (current) {
      depth++;
      if (!current.parentId) {
        break;
      };
      current = this.findTodo(current.parentId);
    }
    return depth;
  }
}
