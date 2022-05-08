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

export interface Follower {
  following_id: User['user_id'];
  user_id: User['user_id'];
}

console.info(`Setting up database for '${process.env['NODE_ENV']}' environment`);
export const db = knex(require('../knexfile.js')[process.env['NODE_ENV']]);

export const getArticleDb = () => db<Article>('articles');
export const getTagsDb = () => db<ArticleTag>('articles_tags');
export const getUserDb = () => db<User>('users');
export const getFavoritesDb = () => db<Favorites>('favorites');
export const getCommentsDb = () => db<Comment>('comments');
export const getFollowersDb = () => db<Follower>('followers');

export type ConduitUser = Pick<User, 'bio' | 'email' | 'image' | 'token' | 'username'>;

export interface ConduitProfile {
  bio: User['bio'];
  following: boolean;
  image: User['image'];
  username: User['username'];
}

export interface ConduitArticle {
  author: ConduitProfile;
  body: Article['body'];
  createdAt: string;
  description: Article['description'];
  favorited: boolean;
  favoritesCount: number;
  slug: Article['slug'];
  tagList: Array<string>;
  title: Article['title'];
  updatedAt: string;
}

export interface ConduitComment {
  author: ConduitProfile;
  body: Comment['body'];
  createdAt: string;
  id: Comment['comment_id'];
  updatedAt: string;
}

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

export const getUserByToken = async (token: string) =>
  await getUserDb()
    .select('user_id')
    .where('token', token)
    .first()

export const addComment = async (userId: number, articleSlug: string, body: string): Promise<ConduitComment> => {
  const [insertId] = await getCommentsDb().insert({
    article_slug: articleSlug,
    body: body,
    user_id: userId
  });

  const comment = await getCommentsDb()
    .select(
      'bio',
      'body',
      'comment_id',
      'created_at',
      'image',
      'updated_at',
      'username'
    )
    .join('users', 'users.user_id', 'comments.user_id')
    .where({ comment_id: insertId })
    .first();

  return {
    author: {
      bio: comment.bio,
      // User can't follow themself so no point in figuring it out
      following: false,
      image: comment.image,
      username: comment.username
    },
    body: comment.body,
    createdAt: new Date(comment.created_at).toISOString(),
    id: comment.comment_id,
    updatedAt: new Date(comment.updated_at).toISOString()
  };
}

export const getArticleComments = async (
  articleSlug: string,
  asUserId: number = 0
): Promise<Array<ConduitComment>> => {
  const commentsQuery = getCommentsDb()
    .select(
      'bio',
      'body',
      'created_at',
      'comment_id',
      'following_id',
      'image',
      'updated_at',
      'username'
    )
    .join('users', 'users.user_id', 'comments.user_id')
    .leftJoin('followers', (clause) => {
      clause
        .on('followers.following_id', '=', 'comments.user_id')
        // @ts-expect-error: number should be fine
        .andOn('followers.user_id', '=', asUserId);
    })
    .where('article_slug', articleSlug);

  const comments = await commentsQuery;
  console.log(comments);

  return comments.map((comment) => ({
    author: {
      bio: comment.bio,
      // following_id would be null on left join if user isn't followed
      following: comment.following_id ? true : false,
      image: comment.image,
      username: comment.username
    },
    body: comment.body,
    createdAt: new Date(comment.created_at).toISOString(),
    id: comment.comment_id,
    updatedAt: new Date(comment.updated_at).toISOString()
  }));
}
