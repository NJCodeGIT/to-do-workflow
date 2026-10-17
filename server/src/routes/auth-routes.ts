import { Router } from 'express';
import { login, register } from '../controllers/auth-controller.js';

export const authRoutes = Router();

authRoutes.post('/auth/register', register);
authRoutes.post('/auth/login', login);
