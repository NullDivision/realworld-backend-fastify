import type { FastifyPluginCallback } from 'fastify';
import { User, getUserDb, getFollowersDb } from '../data';

type TokenizedUser = Omit<User, 'password' | 'token' | 'user_id'>;

interface ProfileGeneric {
  Params: { username: string };
  Reply: { profile: (TokenizedUser & { following: boolean }) | null };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.get<ProfileGeneric>('/:username', {
    handler: async (request, reply) => {
      const [currentUser, followedUser] = await Promise.all([
        getUserDb()
          .select('user_id')
          .where('token', request.headers.authorization?.replace('Bearer ', ''))
          .first(),
        getUserDb()
          .select('bio', 'email', 'image', 'user_id', 'username')
          .where('username', request.params.username)
          .first()
      ]);

      if (!followedUser || !currentUser) return reply.send({ profile: null });

      const { user_id: followedUserId, ...restFollowedUser } = followedUser;
      const followState = await getFollowersDb()
        .where('following_id', followedUserId)
        .andWhere('user_id', currentUser.user_id)
        .first();

      return reply.send({
        profile: { ...restFollowedUser, following: !!followState }
      });
    },
    onRequest: [instance.authenticate]
  });

  instance.post<ProfileGeneric>('/:username/follow', {
    handler: async (request, reply) => {
      const [currentUser, followedUser] = await Promise.all([
        getUserDb()
          .select('user_id')
          .where('token', request.headers.authorization?.replace('Bearer ', ''))
          .first(),
        getUserDb()
          .select('bio', 'email', 'image', 'user_id', 'username')
          .where('username', request.params.username)
          .first()
      ]);

      if (!followedUser || !currentUser) return reply.send({ profile: null });

      await getFollowersDb().insert({
        following_id: followedUser.user_id,
        user_id: currentUser.user_id
      });

      const { user_id, ...restFollowedUser } = followedUser;

      await reply.send({ profile: { ...restFollowedUser, following: true } });
    },
    onRequest: [instance.authenticate]
  });

  done();
};
