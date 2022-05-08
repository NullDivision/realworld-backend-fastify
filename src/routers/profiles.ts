import type { FastifyPluginCallback } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import {
  ConduitProfile,
  getProfileByUsername,
  getUserByToken,
  followUser,
  unfollowUser
} from '../data';

interface ProfileGeneric {
  Params: { username: string };
  Reply: { profile: ConduitProfile | null };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.get<ProfileGeneric>('/:username', async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '');
    let currentUser: Awaited<ReturnType<typeof getUserByToken>> | undefined;

    if (token) {
      currentUser = await getUserByToken(token);
    }

    const profile = await getProfileByUsername(
      request.params.username,
      currentUser?.user_id
    );

    return reply.send({ profile: profile || null });
  });

  instance.post<ProfileGeneric>('/:username/follow', {
    handler: async (request, reply) => {
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        throw new Error('Invalid token');
      }

      const currentUser = await getUserByToken(token);

      if (!currentUser) {
        return await reply.code(StatusCodes.UNAUTHORIZED).send({ profile: null });
      }

      const profile = await followUser(
        request.params.username,
        currentUser.user_id
      );

      if (!profile) {
        return await reply.code(StatusCodes.NOT_FOUND).send({ profile: null })
      }

      await reply.send({ profile });
    },
    onRequest: [instance.authenticate]
  });

  instance.delete<ProfileGeneric>('/:username/follow', {
    handler: async (request, reply) => {
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return reply.code(StatusCodes.UNAUTHORIZED).send({ profile: null });
      }

      const currentUser = await getUserByToken(token);

      if (!currentUser) {
        return reply.code(StatusCodes.UNAUTHORIZED).send({ profile: null });
      }

      const profile = await unfollowUser(request.params.username, currentUser.user_id);

      if (!profile) {
        return reply.code(StatusCodes.NOT_FOUND).send({ profile: null });
      }

      await reply.send({ profile });
    },
    onRequest: [instance.authenticate]
  });

  done();
};
