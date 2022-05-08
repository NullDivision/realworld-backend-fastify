import { FastifyPluginCallback } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { FromSchema } from 'json-schema-to-ts';
import { encodePassword, validatePassword } from '../auth';
import { ConduitUser, getUserDb } from '../data';

const LoginRequestBodySchema = {
  properties: {
    user: {
      properties: {
        email: { type: 'string' },
        password: { type: 'string' }
      },
      required: ['email', 'password'],
      type: 'object'
    }
  },
  required: ['user'],
  type: 'object'
} as const;

interface LoginGeneric {
  Body: FromSchema<typeof LoginRequestBodySchema>;
  Reply: { user: ConduitUser | null };
}

const getTokenizedUserByEmail = (email: string) =>
  getUserDb().where('email', email).first();

const CreateRequestBodySchema = {
  properties: {
    user: {
      properties: {
        email: { type: 'string' },
        password: { type: 'string' },
        username: { type: 'string' }
      },
      required: ['email', 'password', 'username'],
      type: 'object'
    }
  },
  required: ['user'],
  type: 'object'
} as const;

interface UsersPostGeneric {
  Body: FromSchema<typeof CreateRequestBodySchema>;
  Reply: { user: ConduitUser | null };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.post<UsersPostGeneric>('/', {
    handler: async ({ body }, reply) => {
      try {
        await getUserDb().insert({
          email: body.user.email,
          password: await encodePassword(body.user.password),
          username: body.user.username
        });

        const result = await getTokenizedUserByEmail(body.user.email);

        if (result == null) throw new Error('Could not insert user');

        void reply
          .code(StatusCodes.CREATED)
          .send({
            user: {
              bio: result.bio,
              email: result.email,
              image: result.image,
              token: result.token,
              username: result.username
            }
          });
      } catch (error) {
        console.error(error);

        return await reply.code(StatusCodes.INTERNAL_SERVER_ERROR);
      }
    },
    schema: { body: CreateRequestBodySchema }
  });

  instance.post<LoginGeneric>('/login', {
    handler: async (request, reply) => {
      const user = await getTokenizedUserByEmail(request.body.user.email);

      if (user == null) {
        request.log.error('User not found');

        return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });
      }

      const { password, user_id, ...tokenizedUser } = user;
      const isValidPassword = await validatePassword(
        request.body.user.password,
        user.password
      );

      if (!isValidPassword) {
        request.log.error('Invalid password');

        return await reply.code(StatusCodes.UNAUTHORIZED).send();
      }

      const token = instance.jwt.sign({ payload: {} });

      await getUserDb().where('email', user.email).update('token', token);

      void reply.code(StatusCodes.CREATED).send({ user: { ...tokenizedUser, token } });
    },
    schema: { body: LoginRequestBodySchema }
  });

  done();
};
