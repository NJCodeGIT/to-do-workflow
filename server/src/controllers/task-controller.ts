import type { Request, Response } from 'express';
import { dbFrom } from '../db/connection.js';
import { createTask, deleteTask, getTask, listTasks, updateTask } from '../db/tasks.js';
import { AppError } from '../errors.js';
import { userIdOf } from '../middleware/require-auth.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  parseBody,
  parseTaskId,
  updateTaskSchema,
} from '../schemas.js';

// userIdOf runs first so a route missing requireAuth fails closed before any parsing.

// One body for malformed, missing, foreign and deleted ids (decision 38).
const taskNotFound = () => new AppError('NOT_FOUND', 404, 'Task not found');

function taskIdOf(req: Request): number {
  const id = parseTaskId(req.params.id);
  if (id === null) throw taskNotFound();
  return id;
}

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

export function getTaskHandler(req: Request, res: Response): void {
  const userId = userIdOf(req);
  const id = taskIdOf(req);
  const task = getTask(dbFrom(req), userId, id);
  if (!task) throw taskNotFound();
  res.status(200).json(task);
}

export function updateTaskHandler(req: Request, res: Response): void {
  const userId = userIdOf(req);
  const id = taskIdOf(req);
  const patch = parseBody(updateTaskSchema, req.body);
  const task = updateTask(dbFrom(req), userId, id, patch);
  if (!task) throw taskNotFound();
  res.status(200).json(task);
}

export function deleteTaskHandler(req: Request, res: Response): void {
  const userId = userIdOf(req);
  const id = taskIdOf(req);
  if (!deleteTask(dbFrom(req), userId, id)) throw taskNotFound();
  res.status(204).end();
}
