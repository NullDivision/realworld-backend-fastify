import fastify from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { router } from './profiles';

const server = fastify();

describe('Profile router', () => {
  beforeAll(async () => {
    await server.register(router);
  });

  it('[GET] /{{username}} returns a user record', async () => {
    const reply = await server.inject('/');

    expect(reply.statusCode).toBe(StatusCodes.OK);
  });
});
