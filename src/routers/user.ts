import { FastifyPluginCallback } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { FromSchema } from 'json-schema-to-ts';
import { encodePassword } from '../auth';
import { User, getUserDb } from '../data';

const getTokenizedUserByToken = (token: string) => {
  if (!token.length) {
    throw new Error('Must use valid token to prevent false positives');
  }

  return getUserDb().where('token', token).first();
};

type TokenizedUser = Omit<User, 'password' | 'user_id'>;

const UpdateRequestBodySchema = {
  properties: {
    user: {
      properties: {
        bio: { type: 'string' },
        email: { type: 'string' },
        image: { type: 'string' },
        password: { type: 'string' },
        username: { type: 'string' }
      },
      type: 'object'
    }
  },
  type: 'object'
} as const;

interface UserUpdateGeneric {
  Body: FromSchema<typeof UpdateRequestBodySchema>;
  Reply: { user: TokenizedUser | null };
}

interface GetUserGeneric { Reply: { user: TokenizedUser | null } }

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.get<GetUserGeneric>('/', {
    handler: async (request, reply) => {
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token) return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

      const user = await getTokenizedUserByToken(token);

      if (user == null) return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

      void reply.code(StatusCodes.OK).send({ user });
    },
    onRequest: [instance.authenticate]
  });

  instance.put<UserUpdateGeneric>('/', {
    handler: async (request, reply) => {
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token || (request.body.user == null)) {
        return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });
      }

      const { password: newPassword, ...restUpdateUser } = request.body.user;

      let updateFields: Partial<User> = restUpdateUser;

      if (newPassword) {
        updateFields.password = await encodePassword(newPassword);
      }

      await getUserDb().where('token', token).update(updateFields);

      const user = await getTokenizedUserByToken(token);

      if (user == null) return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

      const { password, user_id, ...tokenizedUser } = user;

      void reply.code(StatusCodes.OK).send({ user: tokenizedUser });
    },
    onRequest: [instance.authenticate]
  });

  done();
};
