import TodoValidator from '../todos/TodoValidator';
import { TodosProvider } from '../todos/TodosProvider';

export interface GetTodosInput {
  includeCompleted?: boolean;
  parentId?: string;
}

export interface AddTodoInput {
  text: string;
  parentId?: string;
}

export interface ToggleTodoInput {
  todoId: string;
}

export interface RenameTodoInput {
  todoId: string;
  text: string;
}

export interface RemoveTodoInput {
  todoId: string;
}

function toTodoMetadata(todo: {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
  order: number;
  parentId?: string;
}) {
  return {
    id: todo.id,
    text: todo.text,
    done: todo.done,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    order: todo.order,
    parentId: todo.parentId
  };
}

function getTodoOrThrow(todosProvider: TodosProvider, todoId: string) {
  const todo = todosProvider.findTodo(todoId);
  if (!todo) {
    throw new Error('Todo not found. Provide a valid todoId from get_todos results.');
  }
  return todo;
}

export async function getTodos(todosProvider: TodosProvider, input: GetTodosInput = {}) {
  let todos = todosProvider.getTodos();
  if (input.includeCompleted === false) {
    todos = todos.filter(todo => !todo.done);
  }
  if (input.parentId) {
    getTodoOrThrow(todosProvider, input.parentId);
    todos = todos.filter(todo => todo.parentId === input.parentId);
  }

  return {
    count: todos.length,
    todos: todos.map(toTodoMetadata),
    stats: todosProvider.getTodoStats()
  };
}

export async function addTodo(todosProvider: TodosProvider, input: AddTodoInput) {
  const todos = todosProvider.getTodos();
  const validationError = TodoValidator.validateForCreate({
    text: input.text ?? '',
    todos,
    parentId: input.parentId
  });
  if (validationError) {
    throw new Error(validationError);
  }

  if (input.parentId) {
    getTodoOrThrow(todosProvider, input.parentId);
  }

  await todosProvider.addTodo(input.text, input.parentId);
  const created = todosProvider.getTodos().find(todo => {
    return todo.text === input.text.trim() && todo.parentId === input.parentId;
  });

  return {
    success: true,
    todo: created ? toTodoMetadata(created) : undefined
  };
}

export async function toggleTodo(todosProvider: TodosProvider, input: ToggleTodoInput) {
  getTodoOrThrow(todosProvider, input.todoId);
  await todosProvider.toggleTodoById(input.todoId);
  const updated = getTodoOrThrow(todosProvider, input.todoId);

  return {
    success: true,
    todo: toTodoMetadata(updated)
  };
}

export async function renameTodo(todosProvider: TodosProvider, input: RenameTodoInput) {
  getTodoOrThrow(todosProvider, input.todoId);

  const textError = TodoValidator.validateText(input.text ?? '');
  if (textError) {
    throw new Error(textError);
  }

  await todosProvider.renameTodo(input.todoId, input.text);
  const updated = getTodoOrThrow(todosProvider, input.todoId);

  return {
    success: true,
    todo: toTodoMetadata(updated)
  };
}

export async function removeTodo(todosProvider: TodosProvider, input: RemoveTodoInput) {
  getTodoOrThrow(todosProvider, input.todoId);
  await todosProvider.deleteTodo(input.todoId);

  return {
    success: true,
    deletedTodoId: input.todoId
  };
}
