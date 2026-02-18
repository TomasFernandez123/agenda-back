import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  CORS_ORIGIN: Joi.string().default('http://localhost:4200'),
  FRONTEND_BASE_URL: Joi.string().uri().default('http://localhost:4200'),
  MONGODB_URI: Joi.string().required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_USERNAME: Joi.string().optional(),
  REDIS_PASSWORD: Joi.string().optional(),
  REDIS_TLS: Joi.boolean().default(false),
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_RESET_SECRET: Joi.string().optional(),
  JWT_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
  PASSWORD_RESET_EXPIRATION_SECONDS: Joi.number()
    .integer()
    .min(900)
    .max(3600)
    .default(1800),
  SUPERADMIN_EMAIL: Joi.string().email().default('admin@agenda-saas.com'),
  SUPERADMIN_PASSWORD: Joi.string().min(8).default('SuperAdmin123!'),
});
