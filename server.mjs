import { createCloudApp } from './src/cloud-app.mjs';
import { createPostgresStore } from './src/postgres-store.mjs';

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const allowedOrigins = [process.env.APP_ORIGIN, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`].filter(Boolean);
const app = createCloudApp({ store: connectionString ? createPostgresStore(connectionString) : null, allowedOrigins, trustedProxy: process.env.VERCEL === '1' });
app.listen(Number(process.env.PORT ?? 3000));
