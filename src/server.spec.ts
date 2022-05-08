import { StatusCodes } from 'http-status-codes';
import { getUserDb } from './data';
import { server } from './server';

const testUser = {
  email: 'server-user@test.com',
  password: 'test-server-password',
  user_id: 4,
  username: 'testuser69-server'
};

describe('Server', () => {
  describe('/users', () => {
    beforeEach(async () => {
        await getUserDb().where('username', testUser.username).delete();
    });

    it('[POST] /users registers a new user and returns it', async () => {
        const reply = await server.inject({
            method: 'POST',
            path: '/users',
            payload: { user: testUser }
        });

        expect(reply.statusCode).toBe(StatusCodes.CREATED);
        expect(reply.json().user).toEqual({
            bio: null,
            email: testUser.email,
            image: null,
            token: null,
            username: testUser.username
        });
    });

    describe('[POST] /users/login', () => {
      beforeEach(async () => {
          await server.inject({
              method: 'POST',
              path: '/users',
              payload: { user: testUser }
          });
      });

      it('returns user on success', async () => {
        const reply = await server.inject({
            method: 'POST',
            path: '/users/login',
            payload: {
                user: {
                    email: testUser.email,
                    password: testUser.password
                }
            }
        });

        expect(reply.statusCode).toBe(201);
        expect(reply.json()).toEqual({
            user: {
                bio: null,
                email: testUser.email,
                image: null,
                token: expect.any(String),
                username: testUser.username
            }
        });
      });

      it('returns a rejection on failed login', async () => {
        const reply = await server.inject({
            method: 'POST',
            path: '/users/login',
            payload: {
                user: {
                    email: testUser.email,
                    password: 'invalid-password'
                }
            }
        });

        expect(reply.statusCode).toBe(StatusCodes.UNAUTHORIZED);
      });
    });
  });

  it('formats response on validation failure', async () => {
    await server.inject({
      method: 'POST',
      path: '/users',
      payload: { user: testUser }
    });

    const loginReply = await server.inject({
      method: 'POST',
      path: '/users/login',
      payload: { user: testUser }
    });
    const reply = await server.inject({
      headers: { authorization: `Bearer ${loginReply.json().user.token}` },
      method: 'POST',
      path: '/articles'
    });

    expect(reply.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(reply.json()).toEqual({ errors: { body: ['should be object'] } });
  });
});
