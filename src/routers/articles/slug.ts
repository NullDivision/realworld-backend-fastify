import { FastifyPluginCallback } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { FromSchema } from 'json-schema-to-ts';
import {
  Article,
  Comment,
  ConduitComment,
  User,
  addComment,
  getArticleBySlug,
  getArticleDb,
  getFavoritesDb,
  getUserDb,
  getCommentsDb,
  getTagsDb,
  getUserByToken,
  getArticleComments
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

interface CommentAuthor extends Pick<User, 'bio' | 'image' | 'username'> {
  following: boolean;
}

interface ReplyComment extends Pick<Comment, 'body'> {
  author: CommentAuthor;
  createdAt: string;
  id: Comment['comment_id'];
  updatedAt: string;
}

interface AddCommentGeneric extends BaseSlugGeneric {
  Body: FromSchema<typeof AddCommentSchema>;
  Reply: { comment: ConduitComment | null }
}

interface GetCommentsGeneric extends BaseSlugGeneric {
  Reply: { comments: Array<ReplyComment> };
}

interface DeleteCommentGeneric extends BaseSlugGeneric {
  Params: BaseSlugGeneric['Params'] & { commentId: string };
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
    onRequest: [instance.authenticate],
    schema: { body: UpdateArticleSchema }
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

  instance.post<AddCommentGeneric>('/comments', {
    handler: async ({ body, headers: { authorization }, params }, reply) => {
      if (!authorization) {
        return await reply.code(StatusCodes.UNAUTHORIZED).send({ comment: null });
      }

      const user = await getUserByToken(authorization.replace('Bearer ', ''));

      if (!user) {
        return await reply.code(StatusCodes.UNAUTHORIZED).send({ comment: null });
      }

      const comment = await addComment(
        user.user_id,
        params.slug,
        body.comment.body
      );

      await reply.code(StatusCodes.CREATED).send({ comment });
    },
    onRequest: [instance.authenticate],
    schema: { body: AddCommentSchema }
  });

  instance.get<GetCommentsGeneric>('/comments', async (request, reply) => {
    await reply.code(StatusCodes.OK).send({
      comments: await getArticleComments(request.params.slug)
    });
  });

  instance.delete<DeleteCommentGeneric>('/comments/:commentId(\\d+)', {
    handler: async (request, reply) => {
      const user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first();

      if (!user) {
        return reply.code(StatusCodes.UNAUTHORIZED).send();
      }

      await getCommentsDb().where({
        article_slug: request.params.slug,
        comment_id: parseInt(request.params.commentId, 10),
        user_id: user.user_id
      }).delete();

      await reply.code(StatusCodes.NO_CONTENT).send();
    },
    onRequest: [instance.authenticate]
  });

  instance.delete<BaseSlugGeneric>('/', {
    handler: async (request, reply) => {
      const user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first();

      if (!user) return reply.code(StatusCodes.UNAUTHORIZED).send();

      // Check if user is the owner of the article
      const article = await getArticleDb().where({
        created_by: user.user_id,
        slug: request.params.slug
      });

      if (!article) return reply.code(StatusCodes.UNAUTHORIZED).send();

      await Promise.all([
        getFavoritesDb().where('article_slug', request.params.slug).delete(),
        getTagsDb().where('article_slug', request.params.slug).delete(),
        getArticleDb().where('slug', request.params.slug).delete()
      ]);

      return reply.code(StatusCodes.NO_CONTENT).send();
    },
    onRequest: [instance.authenticate]
  });

  done();
};
