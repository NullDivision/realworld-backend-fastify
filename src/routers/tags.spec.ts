import fastify from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { router } from './tags';

const server = fastify();

describe('Tags router', () => {
  beforeAll(async () => {
    await server.register(router);
  });

  it('[GET] / returns a list of all tags', async () => {
    const reply = await server.inject('/');

    expect(reply.statusCode).toBe(StatusCodes.OK);
  });
});
