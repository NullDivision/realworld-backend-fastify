import { compare, genSalt, hash } from 'bcrypt';
import fastify, {
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler
} from 'fastify';
import jwt from 'fastify-jwt';
import { StatusCodes } from 'http-status-codes';
import { router as articlesRouter } from './routers/articles';
import { router as userRouter } from './routers/user';
import { router as usersRouter } from './routers/users';

export const server = fastify({
  logger: process.env['NODE_ENV'] === 'development'
});

// It sucks every year, this is just the most recent
server.register(jwt, { secret: 'jssucks-2022' });

server.addHook('onRequest', (request, reply, done) => {
  if (request.headers.authorization?.startsWith('Token ')) {
    request.headers.authorization = request.headers.authorization.replace('Token', 'Bearer');
  }

  done();
});

server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (error) {
    await reply.code(StatusCodes.UNAUTHORIZED).send(error);
  }
});

declare module 'fastify' {
  export interface FastifyInstance {
    authenticate: onRequestAsyncHookHandler;
  }
}

server.register(articlesRouter, { prefix: '/articles' });
server.register(userRouter, { prefix: '/user' });
server.register(usersRouter, { prefix: '/users' });
