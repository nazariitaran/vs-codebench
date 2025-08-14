export interface Todo {
    id: string;
    text: string;
    done: boolean;
    createdAt: number;
    updatedAt: number;
    order: number;
    parentId?: string;
    children?: Todo[];
}

export interface TodoData {
    version: number;
    todos: Todo[];
}

export interface TodoStats {
    total: number;
    completed: number;
    remaining: number;
    rootCount: number;
    subTodoCount: number;
}

export const CURRENT_TODO_VERSION = 1;
