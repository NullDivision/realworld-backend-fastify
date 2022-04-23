import knex from 'knex';

if (!process.env['NODE_ENV']) throw new Error('Invalid environment');

export interface User {
  bio: string | null;
  email: string;
  image: string | null;
  password: string;
  token: string | null;
  user_id: number;
  username: string;
}

export interface Article {
  created_at: string;
  created_by: User['user_id'];
  body: string | null;
  description: string | null;
  title: string;
  slug: string;
  updated_at: string;
}

export interface ArticleTag {
  article_slug: Article['slug'];
  tag: string;
}

export interface Favorites {
  article_slug: Article['slug'];
  user_id: User['user_id'];
}

export interface Comment {
  article_slug: string;
  body: string;
  comment_id: number;
  created_at: string;
  updated_at: string;
  user_id: User['user_id'];
}

console.info(`Setting up database for '${process.env['NODE_ENV']}' environment`);
export const db = knex(require('../knexfile.js')[process.env['NODE_ENV']]);

export const getArticleDb = () => db<Article>('articles');
export const getTagsDb = () => db<ArticleTag>('articles_tags');
export const getUserDb = () => db<User>('users');
export const getFavoritesDb = () => db<Favorites>('favorites');
export const getCommentsDb = () => db<Comment>('comments');

type PublicArticle =
  & Pick<Article, 'body' | 'description' | 'slug' | 'title'>
  & {
    author: User['username'];
    createdAt: Article['created_at'];
    favorited: boolean;
    favoritesCount: number;
    tagList: string[];
    updatedAt: Article['updated_at'];
  };

const PublicArticleKeys = [
  'body',
  'created_at',
  'description',
  'slug',
  'title',
  'updated_at'
] as const;

export const getArticleBySlug = async (
  slug: string,
  currentUserId?: User['user_id']
): Promise<PublicArticle | void> => {
  const [article, favorites, tagsList]: [
    | (
      & Pick<Article, 'body' | 'created_at' | 'description' | 'slug' |'title' | 'updated_at'>
      & Pick<User, 'username'>
    )
    | undefined,
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
      .where('slug', slug)
      .first(),
    getFavoritesDb().where('article_slug', slug),
    getTagsDb().where('article_slug', slug)
  ]);

  if (!article) return;

  const { created_at, updated_at, username, ...restArticle } = article;

  return {
    ...restArticle,
    author: username,
    createdAt: new Date(created_at).toISOString(),
    favorited: !!(currentUserId && favorites.find(({ user_id }) => user_id === currentUserId)),
    favoritesCount: favorites.length,
    tagList: tagsList.map(({ tag }) => tag),
    updatedAt: new Date(updated_at).toISOString()
  };
};
