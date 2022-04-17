import { db } from './src/data';

afterAll(async () => {
  console.info('Destroying db to prevent open handles error...');
  await db.destroy();
});