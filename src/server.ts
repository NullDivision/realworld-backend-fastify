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
import { router as profilesRouter } from './routers/profiles';
import { router as tagsRouter } from './routers/tags';

export const server = fastify({
  logger: true
});

// It sucks every year, this is just the most recent
void server.register(jwt, { secret: 'jssucks-2022' });

// Conduit uses Token instead of Bearer for the token so we support both
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

// By default Fastify throws an error when body is empty
server.addContentTypeParser(
  'application/json',
  { bodyLimit: 0 },
  (request, payload, done) => {
    let data = '';

    payload.on('data', (chunk) => {
      data += chunk;
    })
    payload.on('end', () => {
      if (data.length) {
        return done(null, JSON.parse(data));
      }

      done(null, {});
    });
  }
);

declare module 'fastify' {
  export interface FastifyInstance {
    authenticate: onRequestAsyncHookHandler;
  }
}

void server.register(articlesRouter, { prefix: '/articles' });
void server.register(userRouter, { prefix: '/user' });
void server.register(usersRouter, { prefix: '/users' });
void server.register(profilesRouter, { prefix: '/profiles' })
void server.register(tagsRouter, { prefix: '/tags' })
