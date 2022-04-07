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
  created_at: unknown;
  created_by: User['user_id'];
  body: string | null;
  description: string | null;
  title: string | null;
  slug: string;
  updated_at: unknown;
}

export interface ArticleTag {
  article_slug: Article['slug'];
  tag: string;
}

console.info(`Setting up database for '${process.env['NODE_ENV']}' environment`);
const db = knex(require('../knexfile.js')[process.env['NODE_ENV']]);

export const getArticleDb = () => db<Article>('articles');
export const getTagsDb = () => db<ArticleTag>('articles_tags');
export const getUserDb = () => db<User>('users');
