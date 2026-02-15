import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  mongodb: {
    uri:
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017/agenda-saas?replicaSet=rs0',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret',
    expiration: process.env.JWT_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
    expirationSeconds: parseInt(
      process.env.JWT_EXPIRATION_SECONDS || '900',
      10,
    ),
    refreshExpirationSeconds: parseInt(
      process.env.JWT_REFRESH_EXPIRATION_SECONDS || '604800',
      10,
    ),
  },
  superadmin: {
    email: process.env.SUPERADMIN_EMAIL || 'admin@agenda-saas.com',
    password: process.env.SUPERADMIN_PASSWORD || 'SuperAdmin123!',
  },
}));
