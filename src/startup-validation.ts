import 'dotenv/config';
import { validateRuntimeEnv } from './config/env.validation';

validateRuntimeEnv(process.env);
