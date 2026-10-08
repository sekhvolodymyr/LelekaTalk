import { createCloudApp } from '../src/cloud-app.mjs';
import { createPostgresStore } from '../src/postgres-store.mjs';

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const allowedOrigins = [process.env.APP_ORIGIN, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`].filter(Boolean);
const app = createCloudApp({ store: connectionString ? createPostgresStore(connectionString) : null, allowedOrigins, trustedProxy: process.env.VERCEL === '1' });
const handler = app.listeners('request')[0];

export default async function route(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const original = url.searchParams.get('__route');
  if (original !== null) {
    url.searchParams.delete('__route');
    request.url = `/${original.replace(/^\/+/, '')}${url.search}`;
  }
  return handler(request, response);
}
