import { compare, genSalt, hash } from 'bcrypt';
import { FastifyPluginCallback } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { FromSchema } from 'json-schema-to-ts';
import { User, getUserDb } from '../data';

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

type TokenizedUser = Omit<User, 'password' | 'user_id'>;

interface LoginGeneric {
  Body: FromSchema<typeof LoginRequestBodySchema>;
  Reply: { user: TokenizedUser | null };
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
  Reply: {
    user: TokenizedUser | null;
  };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.post<UsersPostGeneric>('/', {
    handler: async ({ body }, reply) => {
      try {
        const salt = await genSalt(10);

        await getUserDb().insert({
          email: body.user.email,
          password: await hash(body.user.password, salt),
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

      if (user == null) return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

      const { password, user_id, ...tokenizedUser } = user;
      const isValidPassword = await compare(
        request.body.user.password,
        user.password
      );

      if (!isValidPassword) return await reply.code(StatusCodes.UNAUTHORIZED).send();

      const token = instance.jwt.sign({ payload: {} });

      await getUserDb().where('email', user.email).update('token', token);

      void reply.code(StatusCodes.CREATED).send({ user: { ...tokenizedUser, token } });
    },
    schema: { body: LoginRequestBodySchema }
  });

  done();
};
