import fastify from 'fastify';
import { getUserDb } from '../data';
import { router } from './user';

const server = fastify();

server.decorate('authenticate', async () => {});

const testUser = {
  email: 'user@test.com',
  password: 'test-password',
  user_id: 3,
  username: 'testuser69'
};

describe('User router', () => {
  beforeAll(async () => {
    await server.register(router);
  });

  // Recreate the user to ensure it's fresh
  beforeEach(async () => {
    await getUserDb().where('username', testUser.username).delete();
    await getUserDb().insert(testUser);
  });

  it('[GET] /user returns the current logged in user', async () => {
    const testToken = 'users-test-token';
    await getUserDb()
      .update({ token: testToken })
      .where('email', testUser.email);

    const reply = await server.inject({
        headers: { authorization: `Bearer ${testToken}` },
        method: 'GET',
        path: '/'
    });

    expect(reply.statusCode).toBe(200);
  });

  it('[PUT] /user updates user and returns new values', async () => {
    const testToken = 'users-test-token';
    await getUserDb()
      .update({ token: testToken })
      .where('email', testUser.email);

    const reply = await server.inject({
        headers: { authorization: `Bearer ${testToken}` },
        method: 'PUT',
        path: '/',
        payload: { user: { email: 'new-mail@test.com' } }
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({
        user: {
            bio: null,
            email: 'new-mail@test.com',
            image: null,
            token: expect.any(String),
            username: testUser.username
        }
    });
  });
});
