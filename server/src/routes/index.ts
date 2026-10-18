import { Router } from 'express';
import { jsonBody } from '../middleware/json-body.js';
import { healthRoutes } from './health-routes.js';
import { authRoutes } from './auth-routes.js';

export const apiRouter = Router();

apiRouter.use(jsonBody);
apiRouter.use(healthRoutes);
apiRouter.use(authRoutes);
