import { Router } from 'express';
import {
  createTaskHandler,
  deleteTaskHandler,
  getTaskHandler,
  listTasksHandler,
  updateTaskHandler,
} from '../controllers/task-controller.js';
import { requireAuth } from '../middleware/require-auth.js';

export const taskRoutes = Router();

// requireAuth per route, not taskRoutes.use(), so unknown /api/v1 paths stay 404.
taskRoutes.get('/tasks', requireAuth, listTasksHandler);
taskRoutes.post('/tasks', requireAuth, createTaskHandler);
taskRoutes.get('/tasks/:id', requireAuth, getTaskHandler);
taskRoutes.patch('/tasks/:id', requireAuth, updateTaskHandler);
taskRoutes.delete('/tasks/:id', requireAuth, deleteTaskHandler);
