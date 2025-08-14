import { Todo } from './Models';

class TodoValidator {
  static validateText(text: string): string | null {
    const trimmedText = text.trim();
    const length = Array.from(trimmedText).length;
    if (length < 1 || length > 50) {
      return "Text must be between 1 and 50 characters.";
    }
    return null;
  }

  static validateNesting(todos: Todo[], parentId?: string): string | null {
    let depth = 0;
    let currentParentId = parentId;
    while (currentParentId) {
      depth++;
      if (depth > 2) {
        return "Nesting level cannot exceed 3.";
      }
      const parentTodo = todos.find(todo => todo.id === currentParentId);
      currentParentId = parentTodo ? parentTodo.parentId : undefined;
    }
    return null;
  }

  static validateTotalCount(todos: Todo[]): string | null {
    if (todos.length >= 100) {
      return "Total Todo count cannot exceed 100.";
    }
    return null;
  }

  static validateForCreate(params: { text: string, todos: Todo[], parentId?: string }): string | null {
    let errorMessage = this.validateText(params.text);
    if (errorMessage) {
      return errorMessage;
    }

    errorMessage = this.validateNesting(params.todos, params.parentId);
    if (errorMessage) {
      return errorMessage;
    }

    errorMessage = this.validateTotalCount(params.todos);
    if (errorMessage) {
      return errorMessage;
    }

    return null;
  }
}

export default TodoValidator;
