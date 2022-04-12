import { FastifyPluginCallback } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { FromSchema } from 'json-schema-to-ts';
import slugify from 'slugify';
import { Article, User, getArticleDb, getTagsDb, getUserDb, getFavoritesDb, Favorites, ArticleTag } from '../data';

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

interface GetArticleGeneric {
  Params: { slug: string };
  Reply: { article: ReplyArticle };
}

const UpdateArticleSchema = {
  properties: {
    article: { properties: { body: { type: 'string' } }, type: 'object' }
  },
  required: ['article'],
  type: 'object'
} as const;

interface UpdateArticleGeneric {
  Body: FromSchema<typeof UpdateArticleSchema>
  Params: { slug: string };
  Reply: { article: ReplyArticle | null };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
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

      const {
        created_at,
        updated_at,
        username,
        ...article
      }: Article & User = await getArticleDb()
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
        .where('slug', slug)
        .first();

      await reply
        .code(StatusCodes.CREATED)
        .send({
          article: {
            ...article,
            author: username,
            createdAt: new Date(created_at).toISOString(),
            favorited: false,
            favoritesCount: 0,
            tagList: request.body.article.tagList ?? [],
            updatedAt: updated_at && new Date(updated_at).toISOString()
          }
        });
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
        .select('body', 'created_at', 'slug', 'title', 'updated_at', 'username')
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

  instance.get<GetArticleGeneric>('/:slug', async (request, reply) => {
    let user: Pick<User, 'user_id'> | undefined;

    if (request.headers.authorization) {
      user = await getUserDb()
        .select('user_id')
        .where('token', request.headers.authorization?.replace('Bearer ', ''))
        .first();
    }

    const [
      {
        created_at,
        updated_at,
        username,
        ...article
      },
      favorites,
      tags
    ]: [
      & Pick<Article, 'body' | 'created_at' | 'description' | 'slug' | 'title' | 'updated_at'>
      & Pick<User, 'username'>,
      Favorites[],
      ArticleTag[]
    ] = await Promise.all([
        getArticleDb()
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
          .where('slug', request.params.slug)
          .first(),
        getFavoritesDb().where('article_slug', request.params.slug),
        getTagsDb().where('article_slug', request.params.slug)
      ]);

    if (!article) {
      return reply.code(StatusCodes.NOT_FOUND).send();
    }

    await reply.send({
      article: {
        ...article,
        author: username,
        createdAt: new Date(created_at).toISOString(),
        favorited: Boolean(
          user && favorites.find(({ user_id }) => user_id === user?.user_id)
        ),
        favoritesCount: favorites.length,
        tagList: tags.map(({ tag }) => tag),
        updatedAt: new Date(updated_at).toISOString()
      }
    });
  });

  instance.put<UpdateArticleGeneric>('/:slug', {
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
        .where({ created_by: user.user_id, slug: request.params.slug });

      const article = await getArticleDb()
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
        .where('slug', params.slug)
        .first();

      if (!article) {
        return reply.code(StatusCodes.NOT_FOUND).send({ article: null });
      }

      const [favorites, tags] = await Promise.all([
        getFavoritesDb().where('article_slug', params.slug),
        getTagsDb().where('article_slug', params.slug)
      ]);
      const { created_at, updated_at, username, ...restArticle } = article;

      await reply.code(StatusCodes.OK).send({
        article: {
          ...restArticle,
          author: username,
          createdAt: new Date(created_at).toISOString(),
          favorited: Boolean(favorites.find(({ user_id }) => user_id === user.user_id)),
          favoritesCount: favorites.length,
          tagList: tags.map(({ tag }) => tag),
          updatedAt: new Date(updated_at).toISOString()
        }
      });
    },
    onRequest: [instance.authenticate]
  });

  done();
};
