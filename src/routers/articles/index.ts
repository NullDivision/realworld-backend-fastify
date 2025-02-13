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
  getUserDb,
  getUserByToken
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
type ArticlesFilters = Record<'author' | 'favorited' | 'limit' | 'offset' | 'tag', string>;
interface GetArticlesGeneric {
  Querystring: Partial<ArticlesFilters>;
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
      required: ['body', 'description', 'title'],
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

export const router: FastifyPluginCallback = async (instance, options, done) => {
  await instance.register(slugRouter, { prefix: '/:slug' });

  instance.get<GetArticlesGeneric>('/', async (request, reply) => {
    let filteredTags: string[] = [];
    let user: Pick<User, 'user_id'> | undefined;
    let favoritedUserId: number | undefined;

    if (request.headers.authorization) {
      user = await getUserByToken(request.headers.authorization?.replace('Bearer ', ''));
    }

    if (request.query.tag) {
      filteredTags = (
        await getTagsDb().select('article_slug').where('tag', request.query.tag)
      ).map(({ article_slug }) => article_slug);

      if (!filteredTags.length) {
        // If there are no tags there can't be any articles associated with them
        return reply.send({ articles: [], articlesCount: 0 });
      }
    }

    if (request.query.favorited) {
      const favoritedUser = await getUserDb()
        .select('user_id')
        .where('username', request.query.favorited)
        .first();

      if (!favoritedUser) {
        // If user never favorited anything, there are no articles to return
        return reply.send({ articles: [], articlesCount: 0 });
      }

      favoritedUserId = favoritedUser.user_id;
    }

    const articlesQuery = getArticleDb()
      .join('users', 'users.user_id', 'articles.created_by')
      .modify(queryBuilder => {
        if (request.query.author) {
          void queryBuilder.where('username', request.query.author);
        }

        if (favoritedUserId) {
          void queryBuilder
            .join('favorites', 'favorites.article_slug', 'articles.slug')
            .where('favorites.user_id', favoritedUserId);
        }

        if (filteredTags.length > 0) {
          void queryBuilder.whereIn('slug', filteredTags);
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
      )
      .limit(request.query.limit ? parseInt(request.query.limit, 10) : 20)
      .offset(request.query.offset ? parseInt(request.query.offset, 10) : 0);
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

      return reply.send({
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
