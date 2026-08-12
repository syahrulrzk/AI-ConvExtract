import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3100').transform(Number),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.string().default('development'),
  API_KEY: z.string().default('ai-converter-secret-key-123'),
  // Redis connection for the BullMQ job queue
  REDIS_URL: z.string().default('redis://localhost:6379'),
  // App version shown in the frontend footer — override per deployment
  APP_VERSION: z.string().default('V.0.1'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
