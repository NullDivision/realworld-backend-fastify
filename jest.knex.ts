import { db } from './src/data';

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  // Destroying db to prevent open handles error...
  await db.destroy();
});