import type { Request, Response } from 'express';
import { dbFrom } from '../db/connection.js';
import { createTask, listTasks } from '../db/tasks.js';
import { userIdOf } from '../middleware/require-auth.js';
import { createTaskSchema, listTasksQuerySchema, parseBody } from '../schemas.js';

// userIdOf runs first so a route missing requireAuth fails closed before any parsing.

export function createTaskHandler(req: Request, res: Response): void {
  const userId = userIdOf(req);
  const body = parseBody(createTaskSchema, req.body);
  res.status(201).json(createTask(dbFrom(req), userId, body));
}

export function listTasksHandler(req: Request, res: Response): void {
  const userId = userIdOf(req);
  const { status } = parseBody(listTasksQuerySchema, req.query);
  res.status(200).json({ tasks: listTasks(dbFrom(req), userId, status) });
}
