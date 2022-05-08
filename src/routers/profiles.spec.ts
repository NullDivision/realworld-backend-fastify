import fastify from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { getFollowersDb, getUserDb } from '../data';
import { router } from './profiles';

const server = fastify({ logger: { level: 'warn' } });

server.decorate('authenticate', async () => {});

const testUser = {
  email: 'profile-user@test.com',
  password: 'profile-test-password',
  token: 'profile-token',
  user_id: 5,
  username: 'profile-testuser69'
};

const testFollowedUser = {
  email: 'followed-user@test.com',
  password: 'followed-test-password',
  user_id: 6,
  username: 'followed-testuser69'
};

describe('Profile router', () => {
  beforeAll(async () => {
    await server.register(router);
    await getUserDb().insert([testFollowedUser, testUser]);
  });

  beforeEach(async () => {
    await getFollowersDb().where('user_id', testUser.user_id).delete();
  });

  it('[GET] /{{username}} returns a user record', async () => {
    await getFollowersDb().insert({
      following_id: testFollowedUser.user_id,
      user_id: testUser.user_id
    });

    const reply = await server.inject({
      headers: { authorization: `Bearer ${testUser.token}` },
      method: 'GET',
      path: `/${testFollowedUser.username}`
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
    expect(reply.json().profile.following).toBe(true);
  });

  it('[POST] /{{username}}/follow follows a user and returns the record', async () => {
    const reply = await server.inject({
      headers: { authorization: `Bearer ${testUser.token}` },
      method: 'POST',
      path: `/${testFollowedUser.username}/follow`
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
    expect(reply.json().profile.following).toBe(true);
  });

  it('[DELETE] /{{username}}/follow deletes a users follow status and returns the profile', async () => {
    const reply = await server.inject({
      headers: { authorization: `Bearer ${testUser.token}` },
      method: 'DELETE',
      path: `/${testFollowedUser.username}/follow`
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
  });
});
