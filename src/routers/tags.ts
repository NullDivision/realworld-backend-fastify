import { FastifyPluginCallback } from 'fastify';
import { getTagsDb } from '../data';

interface TagsGeneric {
  Reply: { tags: Array<string> }
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.get<TagsGeneric>('/', async (request, reply) => {
    const tags = await getTagsDb().select('tag');

    await reply.send({ tags: tags.map(({ tag }) => tag) });
  });

  done();
};
