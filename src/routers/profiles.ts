import type { FastifyPluginCallback } from 'fastify';
import { User, getUserDb } from '../data';

type TokenizedUser = Omit<User, 'password' | 'token' | 'user_id'>;

interface ProfileGeneric {
  Params: { username: string };
  Reply: { profile: (TokenizedUser & { following: boolean }) | null };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.get<ProfileGeneric>('/:username', async (request, reply) => {
    const user = await getUserDb()
      .select('bio', 'email', 'image', 'username')
      .where('username', request.params.username)
      .first();

    if (!user) return reply.send({ profile: null });

    await reply.send({ profile: { ...user, following: false } });
  });

  done();
};
