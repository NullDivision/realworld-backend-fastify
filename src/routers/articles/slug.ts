import { FastifyPluginCallback } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { FromSchema } from 'json-schema-to-ts';
import slugify from 'slugify';
import {
  Article,
  User,
  getArticleBySlug,
  getArticleDb,
  getFavoritesDb,
  getUserDb
} from '../../data';

type ReplyArticle =
  & Pick<Article, 'body' | 'description' | 'slug' | 'title'>
  & {
    author: User['username'];
    createdAt: Article['created_at'];
    favorited: boolean;
    favoritesCount: number;
    tagList: string[];
    updatedAt: Article['updated_at'];
  };

interface BaseSlugGeneric { Params: { slug: string } }

interface GetArticleGeneric extends BaseSlugGeneric {
  Reply: { article: ReplyArticle | null };
}

const UpdateArticleSchema = {
  properties: {
    article: { properties: { body: { type: 'string' } }, type: 'object' }
  },
  required: ['article'],
  type: 'object'
} as const;

interface UpdateArticleGeneric extends BaseSlugGeneric {
  Body: FromSchema<typeof UpdateArticleSchema>
  Reply: { article: ReplyArticle | null };
}

interface FavoriteArticleGeneric extends BaseSlugGeneric {
  Reply: { article: ReplyArticle | null };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.get<GetArticleGeneric>('/', async (request, reply) => {
    let user: Pick<User, 'user_id'> | undefined;

    if (request.headers.authorization) {
      user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first();
    }

    const article = await getArticleBySlug(request.params.slug, user?.user_id);

    if (!article) {
      return reply.code(StatusCodes.NOT_FOUND).send();
    }

    await reply.send({ article });
  });

  instance.put<UpdateArticleGeneric>('/', {
    handler: async (request, reply) => {
      const { headers, params } = request;
      const user = await getUserDb()
        .select('user_id')
        .where('token', headers.authorization?.replace('Bearer ', ''))
        .first()

      if (!user) {
        return reply.code(StatusCodes.UNAUTHORIZED).send({ article: null });
      }

      // Update article
      await getArticleDb()
        .update({
          body: request.body.article.body,
          updated_at: new Date().toISOString()
        })
        .where({ created_by: user.user_id, slug: params.slug });

      const article = await getArticleBySlug(params.slug, user.user_id);

      if (!article) {
        return reply.code(StatusCodes.NOT_FOUND).send({ article: null });
      }

      await reply.code(StatusCodes.OK).send({ article });
    },
    onRequest: [instance.authenticate]
  });

  instance.post<FavoriteArticleGeneric>('/favorite', {
    handler: async (request, reply) => {
      const user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first()

      if (!user) {
        return reply.code(StatusCodes.UNAUTHORIZED).send({ article: null });
      }

      const oldArticle = await getArticleBySlug(
        request.params.slug,
        user.user_id
      );

      if (!oldArticle) {
        return reply.code(StatusCodes.NOT_FOUND).send({ article: null });
      }

      if (!oldArticle.favorited) {
        await getFavoritesDb().insert({
          article_slug: oldArticle.slug,
          user_id: user.user_id
        });
      }

      const article = await getArticleBySlug(request.params.slug, user.user_id);

      if (!article) throw new Error('Article not found after update');

      await reply.code(StatusCodes.OK).send({ article });
    },
    onRequest: [instance.authenticate]
  });

  done();
};
