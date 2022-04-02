import { StatusCodes } from 'http-status-codes';
import { User, db } from './data';
import { server } from './server';

const testUser = {
    email: 'user@test.com',
    password: 'test-password',
    username: 'testuser69'
};

describe('Server', () => {
    beforeEach(async () => {
        await db<User>('user').where('username', testUser.username).delete()
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

    it('[GET] /user returns the current logged in user', async () => {
        await server.inject({
            method: 'POST',
            path: '/users',
            payload: { user: testUser }
        });

        const loginReply = await server.inject({
            method: 'POST',
            path: '/users/login',
            payload: {
                user: {
                    email: testUser.email,
                    password: testUser.password
                }
            }
        });

        const reply = await server.inject({
            headers: { authorization: `Token ${loginReply.json().user.token}` },
            method: 'GET',
            path: '/user'
        });

        expect(reply.statusCode).toBe(200);
    });

    it('[PUT] /user updates user and returns new values', async () => {
        await server.inject({
            method: 'POST',
            path: '/users',
            payload: { user: testUser }
        });

        const loginReply = await server.inject({
            method: 'POST',
            path: '/users/login',
            payload: {
                user: {
                    email: testUser.email,
                    password: testUser.password
                }
            }
        });

        const reply = await server.inject({
            headers: { authorization: `Token ${loginReply.json().user.token}` },
            method: 'PUT',
            path: '/user',
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
    })
});
