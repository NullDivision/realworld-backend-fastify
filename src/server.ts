import { compare, genSalt, hash } from 'bcrypt';
import fastify, {
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler
} from 'fastify';
import jwt from 'fastify-jwt';
import { StatusCodes } from 'http-status-codes';
import type { FromSchema } from 'json-schema-to-ts';
import { Article, User, getArticleDb, getUserDb, getTagsDb } from './data';

export const server = fastify({ logger: true });

// It sucks every year, this is just the most recent
server.register(jwt, { prefix: 'Token', secret: 'jssucks-2022' });

server.addHook('onRequest', (request, reply, done) => {
  if (request.headers.authorization?.startsWith('Token ')) {
    request.headers.authorization = request.headers.authorization.replace('Token', 'Bearer');
  }

  done();
});

server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (error) {
    void reply.code(StatusCodes.UNAUTHORIZED).send(error);
  }
});

declare module 'fastify' {
  export interface FastifyInstance {
    authenticate: onRequestAsyncHookHandler;
  }
}

const getTokenizedUserByEmail = (email: string) =>
  getUserDb().where('email', email).first();

const getTokenizedUserByToken = (token: string) => {
  if (!token.length) {
    throw new Error('Must use valid token to prevent false positives');
  }

  return getUserDb().where('token', token).first();
};

const CreateRequestBodySchema = {
  properties: {
    user: {
      properties: {
        email: { type: 'string' },
        password: { type: 'string' },
        username: { type: 'string' }
      },
      required: ['email', 'password', 'username'],
      type: 'object'
    }
  },
  required: ['user'],
  type: 'object'
} as const;

type TokenizedUser = Omit<User, 'password' | 'user_id'>;

interface UsersPostGeneric {
  Body: FromSchema<typeof CreateRequestBodySchema>;
  Reply: {
    user: TokenizedUser | null;
  };
}

server.post<UsersPostGeneric>('/users', {
  handler: async ({ body }, reply) => {
    try {
      const salt = await genSalt(10);

      await getUserDb().insert({
        email: body.user.email,
        password: await hash(body.user.password, salt),
        username: body.user.username
      });

      const result = await getTokenizedUserByEmail(body.user.email);

      if (result == null) throw new Error('Could not insert user');

      void reply
        .code(StatusCodes.CREATED)
        .send({
          user: {
            bio: result.bio,
            email: result.email,
            image: result.image,
            token: result.token,
            username: result.username
          }
        });
    } catch (error) {
      console.error(error);

      return await reply.code(StatusCodes.INTERNAL_SERVER_ERROR);
    }
  },
  schema: { body: CreateRequestBodySchema }
});

const LoginRequestBodySchema = {
  properties: {
    user: {
      properties: {
        email: { type: 'string' },
        password: { type: 'string' }
      },
      required: ['email', 'password'],
      type: 'object'
    }
  },
  required: ['user'],
  type: 'object'
} as const;

interface LoginGeneric {
  Body: FromSchema<typeof LoginRequestBodySchema>;
  Reply: { user: TokenizedUser | null };
}

server.post<LoginGeneric>('/users/login', {
  handler: async (request, reply) => {
    const user = await getTokenizedUserByEmail(request.body.user.email);

    if (user == null) return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

    const { password, user_id, ...tokenizedUser } = user;
    const isValidPassword = await compare(
      request.body.user.password,
      user.password
    );

    if (!isValidPassword) return await reply.code(StatusCodes.UNAUTHORIZED).send();

    const token = server.jwt.sign({ payload: {} });

    await getUserDb().where('email', user.email).update('token', token);

    void reply.code(StatusCodes.CREATED).send({ user: { ...tokenizedUser, token } });
  },
  schema: { body: LoginRequestBodySchema }
});

interface GetUserGeneric { Reply: { user: TokenizedUser | null } }

server.get<GetUserGeneric>('/user', {
  handler: async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

    const user = await getTokenizedUserByToken(token);

    if (user == null) return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

    reply.code(StatusCodes.OK).send({ user });
  },
  onRequest: [server.authenticate]
});

const UpdateRequestBodySchema = {
  properties: {
    user: {
      properties: {
        bio: { type: 'string' },
        email: { type: 'string' },
        username: { type: 'string' }
      },
      type: 'object'
    }
  },
  type: 'object'
} as const;

interface UserUpdateGeneric {
  Body: FromSchema<typeof UpdateRequestBodySchema>;
  Reply: { user: TokenizedUser | null };
}

server.put<UserUpdateGeneric>('/user', {
  handler: async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token || (request.body.user == null)) {
      return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });
    }

    await getUserDb().where('token', token).update(request.body.user);

    const user = await getTokenizedUserByToken(token);

    if (user == null) return await reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

    const { password, user_id, ...tokenizedUser } = user;

    void reply.code(StatusCodes.OK).send({ user: tokenizedUser });
  },
  onRequest: [server.authenticate]
})

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

server.get<GetArticlesGeneric>('/articles', async (request, reply) => {
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
