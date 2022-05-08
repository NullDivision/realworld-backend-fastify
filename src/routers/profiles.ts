import type { FastifyPluginCallback } from 'fastify';
import { User, getUserDb, getFollowersDb } from '../data';

type TokenizedUser = Omit<User, 'password' | 'token' | 'user_id' | 'email'>;

interface ProfileGeneric {
  Params: { username: string };
  Reply: { profile: (TokenizedUser & { following: boolean }) | null };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.get<ProfileGeneric>('/:username', async (request, reply) => {
    const [currentUser, followedUser] = await Promise.all([
      getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first(),
      getUserDb()
        .select('bio', 'image', 'user_id', 'username')
        .where('username', request.params.username)
        .first()
    ]);

    if (!followedUser) return reply.send({ profile: null });

    const { user_id: followedUserId, ...restFollowedUser } = followedUser;
    const followState = currentUser ? await getFollowersDb()
      .where('following_id', followedUserId)
      .andWhere('user_id', currentUser.user_id)
      .first() : false;

    return reply.send({
      profile: { ...restFollowedUser, following: !!followState }
    });
  });

  instance.post<ProfileGeneric>('/:username/follow', {
    handler: async (request, reply) => {
      const [currentUser, followedUser] = await Promise.all([
        getUserDb()
          .select('user_id')
          .where('token', request.headers.authorization?.replace('Bearer ', ''))
          .first(),
        getUserDb()
          .select('bio', 'image', 'user_id', 'username')
          .where('username', request.params.username)
          .first()
      ]);

      if (
        !followedUser ||
        !currentUser ||
        // Prevent user from following themself
        currentUser.user_id === followedUser.user_id
      ) return reply.send({ profile: null });

      await getFollowersDb().insert({
        following_id: followedUser.user_id,
        user_id: currentUser.user_id
      });

      const { user_id, ...restFollowedUser } = followedUser;

      await reply.send({ profile: { ...restFollowedUser, following: true } });
    },
    onRequest: [instance.authenticate]
  });

  instance.delete<ProfileGeneric>('/:username/follow', {
    handler: async (request, reply) => {
      const [currentUser, followedUser] = await Promise.all([
        getUserDb()
          .select('user_id')
          .where('token', request.headers.authorization?.replace('Bearer ', ''))
          .first(),
        getUserDb()
          .select('bio', 'image', 'user_id', 'username')
          .where('username', request.params.username)
          .first()
      ]);

      if (!followedUser || !currentUser) return reply.send({ profile: null });

      const { user_id, ...restFollowedUser } = followedUser;

      await getFollowersDb()
        .where('following_id', user_id).andWhere('user_id', currentUser.user_id)
        .delete();

      await reply.send({ profile: { ...restFollowedUser, following: false } });
    },
    onRequest: [instance.authenticate]
  });

  done();
};
