import { FastifyPluginCallback } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { Article, User, getArticleDb, getTagsDb } from '../data';

type ReplyArticle =
  & Pick<Article, 'body' | 'description' | 'slug' | 'title'>
  & {
    author: User['username'];
    createdAt: Article['created_at'];
    tagList: unknown[];
    updatedAt: Article['updated_at'];
  };
interface GetArticlesGeneric {
  Querystring: Partial<Record<'author' | 'tag', string>>;
  Reply: { articles: ReplyArticle[], articlesCount: number };
}

export const router: FastifyPluginCallback = (instance, options, done) => {
  instance.get<GetArticlesGeneric>('/', async (request, reply) => {
    let filteredTags: string[] = [];

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
        'created_by',
        'description',
        'slug',
        'title',
        'updated_at',
        'username'
      );
    const tags = await getTagsDb()
      .whereIn('article_slug', articles.map(({ slug }) => slug));

    void reply
      .code(StatusCodes.OK)
      .send({
        articles: articles.map((article) => {
          const {
            created_at,
            created_by,
            updated_at,
            username,
            ...restArticle
          } = article;

          return {
            ...restArticle,
            author: username,
            createdAt: created_at,
            tagList: tags
              .filter(({ article_slug }) => article_slug === article.slug)
              .map(({ tag }) => tag),
            updatedAt: updated_at
          };
        }),
        articlesCount: counter?.counter ?? 0
      });
  });

  done();
};
