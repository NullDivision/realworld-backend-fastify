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
  getTagsDb,
  getUserDb
} from '../../data';
import { router as slugRouter } from './slug';

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
interface GetArticlesGeneric {
  Querystring: Partial<Record<'author' | 'tag', string>>;
  Reply: { articles: ReplyArticle[], articlesCount: number };
}

const PostArticleSchema = {
  properties: {
    article: {
      properties: {
        body: { type: 'string' },
        description: { type: 'string' },
        tagList: { items: { type: 'string' }, type: 'array' },
        title: { type: 'string' }
      },
      required: ['title'],
      type: 'object'
    }
  },
  required: ['article'],
  type: 'object'
} as const;

interface PostArticlesGeneric {
  Body: FromSchema<typeof PostArticleSchema>
  Reply: { article: ReplyArticle | null };
}

const MaxSlugLength = 60;

const clampTitleToSlug = (title: string): string => {
  const words = title.trim().split(' ');
  let result = '';

  if (!words.length) throw new Error('Invalid title length');

  for (const word of words) {
    if (result.length === 0 && word.length > MaxSlugLength) {
      throw new Error('Invalid word length');
    }

    if (`${result} ${word}`.length > MaxSlugLength) {
      return result;
    }

    result = `${result} ${word}`;
  }

  return result;
};

interface GetFeedGeneric {
  Reply: { articles: Array<ReplyArticle>; articlesCount: number };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.register(slugRouter, { prefix: '/:slug' });

  instance.get<GetArticlesGeneric>('/', async (request, reply) => {
    let filteredTags: string[] = [];
    let user: Pick<User, 'user_id'> | undefined;

    if (request.headers.authorization) {
      user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first();
    }

    if (request.query.tag) {
      filteredTags = (
        await getTagsDb().select('article_slug').where('tag', request.query.tag)
      ).map(({ article_slug }) => article_slug);
    }

    const articlesQuery = getArticleDb()
      .join('users', 'users.user_id', 'articles.created_by')
      .modify(queryBuilder => {
        if (request.query.author) {
          queryBuilder.where('username', request.query.author);
        }

        if (filteredTags.length > 0) {
          queryBuilder.whereIn('slug', filteredTags);
        }
      });
    const [counter] = await articlesQuery.clone().count<{}, [{ counter: number }]>('slug as counter');
    const articles: Array<Article & User> = await articlesQuery
      .select(
        'body',
        'created_at',
        'description',
        'slug',
        'title',
        'updated_at',
        'username'
      );
    const tags = await getTagsDb()
      .whereIn('article_slug', articles.map(({ slug }) => slug));
    const favorites = await getFavoritesDb()
      .whereIn('article_slug', articles.map(({ slug }) => slug));

    await reply
      .code(StatusCodes.OK)
      .send({
        articles: articles.map((article) => {
          const {
            created_at,
            updated_at,
            username,
            ...restArticle
          } = article;
          const articleFavorites = favorites.filter((favorite) =>
            favorite.article_slug === article.slug
          );

          return {
            ...restArticle,
            author: username,
            createdAt: new Date(created_at).toISOString(),
            favorited: Boolean(
              user &&
              articleFavorites.find((favorite) =>
                favorite.user_id === user?.user_id
              )
            ),
            favoritesCount: articleFavorites.length,
            tagList: tags
              .filter(({ article_slug }) => article_slug === article.slug)
              .map(({ tag }) => tag),
            updatedAt: updated_at && new Date(updated_at).toISOString()
          };
        }),
        articlesCount: counter?.counter ?? 0
      });
  });

  instance.post<PostArticlesGeneric>('/', {
    handler: async (request, reply) => {
      const user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first();

      if (!user) {
        return await reply.code(StatusCodes.UNAUTHORIZED).send({ article: null });
      }

      const slug = slugify(clampTitleToSlug(request.body.article.title), {
        lower: true,
        strict: true
      });

      await getArticleDb().insert({
        body: request.body.article.body,
        created_by: user.user_id,
        description: request.body.article.description,
        slug,
        title: request.body.article.title
      });

      if (request.body.article.tagList) {
        await getTagsDb().insert(
          request.body.article.tagList.map((tag) => ({
            article_slug: slug,
            tag
          }))
        );
      }

      const article = await getArticleBySlug(slug, user.user_id);

      if (!article) throw new Error('Could not refetch created ');

      await reply
        .code(StatusCodes.CREATED)
        .send({ article });
    },
    onRequest: [instance.authenticate],
    schema: { body: PostArticleSchema }
  });

  instance.get<GetFeedGeneric>('/feed', {
    handler: async (request, reply) => {
      const user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first();

      if (!user) {
        return await reply
          .code(StatusCodes.UNAUTHORIZED)
          .send({ articles: [], articlesCount: 0 });
      }

      const articlesQuery = getArticleDb().where('created_by', user.user_id);
      const articlesCount = await articlesQuery.clone().count().first();

      if (!articlesCount || typeof articlesCount['count(*)'] !== 'number') {
        throw new Error('Could not fetch articles count');
      }

      const articles: Array<Article & User> = await articlesQuery
        .select(
          'body',
          'created_at',
          'description',
          'slug',
          'title',
          'updated_at',
          'username'
        )
        .join('users', 'users.user_id', 'articles.created_by')
        .orderBy('created_at', 'desc');
      const favoritesList = await getFavoritesDb().whereIn(
        'article_slug',
        articles.map(({ slug }) => slug)
      );
      const tagsList = await getTagsDb().whereIn(
        'article_slug',
        articles.map(({ slug }) => slug)
      );

      reply.send({
        articles: articles.map<ReplyArticle>((article) => {
          const { created_at, updated_at, username, ...restArticle } = article;
          const articleFavorites = favoritesList.filter(({ article_slug }) =>
            article_slug === restArticle.slug
          );

          return {
            ...restArticle,
            author: username,
            createdAt: new Date(created_at).toISOString(),
            favorited: Boolean(
              articleFavorites.find(({ user_id }) => user_id === user.user_id)
            ),
            favoritesCount: articleFavorites.length,
            tagList: tagsList
              .filter(({ article_slug }) => article_slug === article.slug)
              .map(({ tag }) => tag),
            updatedAt: new Date(updated_at).toISOString()
          };
        }),
        articlesCount: articlesCount['count(*)']
      });
    },
    onRequest: [instance.authenticate]
  });

  done();
};
