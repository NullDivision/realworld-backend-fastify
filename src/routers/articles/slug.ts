import { FastifyPluginCallback } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { FromSchema } from 'json-schema-to-ts';
import {
  Article,
  Comment,
  User,
  getArticleBySlug,
  getArticleDb,
  getFavoritesDb,
  getUserDb,
  getCommentsDb
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

interface BaseSlugGeneric {
  Params: { slug: string };
}

interface AgreementSlugGeneric extends BaseSlugGeneric {
  Reply: { article: ReplyArticle | null };
}

const UpdateArticleSchema = {
  properties: {
    article: { properties: { body: { type: 'string' } }, type: 'object' }
  },
  required: ['article'],
  type: 'object'
} as const;

interface UpdateArticleGeneric extends AgreementSlugGeneric {
  Body: FromSchema<typeof UpdateArticleSchema>;
}

const AddCommentSchema = {
  properties: {
    comment: {
      properties: { body: { type: 'string' } },
      required: ['body'],
      type: 'object'
    }
  },
  required: ['comment'],
  type: 'object'
} as const;

interface ReplyComment extends Pick<Comment, 'body'> {
  author: User['username'];
  createdAt: string;
  id: Comment['comment_id'];
  updatedAt: string;
}

interface AddComment {
  Body: FromSchema<typeof AddCommentSchema>;
  Reply: { comment: null }
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.get<AgreementSlugGeneric>('/', async (request, reply) => {
    let user: Pick<User, 'user_id'> | undefined;

    if (request.headers.authorization) {
      user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first();
    }

    const article = await getArticleBySlug(request.params.slug, user?.user_id);

    if (!article) {
      return reply.code(StatusCodes.NOT_FOUND).send({ article: null });
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

  instance.post<AgreementSlugGeneric>('/favorite', {
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

  instance.delete<AgreementSlugGeneric>('/favorite', {
    handler: async (request, reply) => {
      const user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first()

      if (user) {
        await getFavoritesDb().where({
          article_slug: request.params.slug,
          user_id: user.user_id
        }).delete();
      }

      const article = await getArticleBySlug(
        request.params.slug,
        user?.user_id
      );

      return reply.send({ article: article || null });
    },
    onRequest: [instance.authenticate]
  });

  instance.post<AddComment>('/comments', {
    handler: async (request, reply) => {
      const user = await getUserDb()
          .select('user_id')
          .where('token', request.headers.authorization?.replace('Bearer ', ''))
          .first();

      if (!user) {
        await reply.code(StatusCodes.UNAUTHORIZED).send({ comment: null });
      }

      const [insertId] = await getCommentsDb().insert({
        body: request.body.comment.body,
        user_id: user?.user_id
      });

      const { created_at, updated_at, ...comment } = await getCommentsDb()
        .select(
          'username as author',
          'body',
          'created_at',
          'comment_id as id',
          'updated_at'
        )
        .join('users', 'users.user_id', 'comments.user_id')
        .where({ comment_id: insertId })
        .first();

      await reply.code(StatusCodes.CREATED).send({
        comment: {
          ...comment,
          createdAt: new Date(created_at).toISOString(),
          updatedAt: new Date(updated_at).toISOString()
        } || null
      });
    },
    onRequest: [instance.authenticate],
    schema: { body: AddCommentSchema }
  });

  done();
};
