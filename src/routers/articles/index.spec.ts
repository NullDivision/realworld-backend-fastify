import fastify from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { Article, getArticleDb, getTagsDb, getUserDb } from '../../data';
import { router } from '.';

const server = fastify({ logger: true });

server.decorate('authenticate', async (request: any) => {
  if (!request.headers.authorization) {
    throw new Error('Missing authorization header');
  }
});

const testUser = {
  email: 'articles-user@test.com',
  password: 'articles-test-password',
  user_id: 1,
  username: 'articles-testuser69'
};

const testArticle = {
  body: 'Test body',
  created_at: '2022-01-24T12:54:32.000Z',
  created_by: testUser.user_id,
  description: 'Test description',
  slug: 'test-articles-article',
  title: 'Test articles article',
  updated_at: '2022-01-24T12:54:32.000Z'
};

describe('Articles router', () => {
  beforeAll(async () => {
    await server.register(router);
  });

  beforeEach(async () => {
    await getTagsDb().delete();
    await getUserDb().where({ user_id: testUser.user_id }).delete();
  });

  describe('[GET] /', () => {
    beforeEach(async () => {
      await getArticleDb().where({ slug: testArticle.slug }).delete();
      await getTagsDb().delete();
      await getUserDb().where({ user_id: testUser.user_id }).delete();
    });

    it('returns a list of articles', async () => {
      await getUserDb().insert([testUser]);
      await getArticleDb().insert([testArticle]);
      await getTagsDb().insert([{
        article_slug: testArticle.slug,
        tag: 'test'
      }]);

      const reply = await server.inject({
        method: 'GET',
        path: '/'
      });

      expect(reply.statusCode).toBe(200);
      expect(reply.json()).toEqual({
        articles: expect.arrayContaining([{
          author: testUser.username,
          body: testArticle.body,
          createdAt: testArticle.created_at,
          description: testArticle.description,
          favorited: false,
          favoritesCount: 0,
          slug: testArticle.slug,
          tagList: ['test'],
          title: testArticle.title,
          updatedAt: testArticle.updated_at
        }]),
        articlesCount: expect.any(Number)
      });
      expect(reply.json().articlesCount).toBeGreaterThanOrEqual(1);
    });

    it('filters articles by author', async () => {
      const testCreateDate = '2022-04-06T17:46:24.000Z'
      const testUpdateDate = '2022-04-06T17:46:24.000Z'
      const testInvalidUser = {
        email: 'user2@test.com',
        password: 'test-password',
        user_id: 2,
        username: 'testuser96'
      };
      const testValidArticle = {
        body: 'Test body',
        created_at: testCreateDate,
        created_by: testUser.user_id,
        description: 'Test description',
        slug: 'test-article-valid',
        title: 'Test article',
        updated_at: testUpdateDate
      };
      const testInvalidArticle = {
        body: 'Test body',
        created_at: testCreateDate,
        created_by: testInvalidUser.user_id,
        description: 'Test description',
        slug: 'test-article-invalid',
        title: 'Test article',
        updated_at: testUpdateDate
      };

      await getArticleDb()
        .whereIn('slug', [testValidArticle.slug, testInvalidArticle.slug])
        .delete();
      await getUserDb().insert(testUser);
      await getArticleDb().insert([testValidArticle, testInvalidArticle]);

      const reply = await server.inject({
        method: 'GET',
        path: '/',
        query: { author: testUser.username }
      });

      expect(reply.json().articles).toEqual(expect.arrayContaining([{
        author: testUser.username,
        body: testValidArticle.body,
        createdAt: testCreateDate,
        description: testValidArticle.description,
        favorited: false,
        favoritesCount: 0,
        slug: testValidArticle.slug,
        tagList: [],
        title: testValidArticle.title,
        updatedAt: testUpdateDate
      }]));
    });
  });

  it('[POST] / stores and returns the article', async () => {
    const testToken = 'test-token';
    const testTagList = ['sci-fi', 'original'];

    await getUserDb().where({ user_id: testUser.user_id }).delete();
    await getUserDb().insert({ ...testUser, token: testToken });

    const { slug, ...testArticleWithoutSlug } = testArticle;
    const reply = await server.inject({
      headers: { authorization: `Bearer ${testToken}` },
      method: 'POST',
      path: '/',
      payload: {
        article: { ...testArticleWithoutSlug, tagList: testTagList }
      }
    });

    expect(reply.statusCode).toBe(StatusCodes.CREATED);
    expect(reply.json()).toEqual({
      article: {
        author: testUser.username,
        body: testArticle.body,
        createdAt: expect.stringMatching(/^\d{4,}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d.\d+(?:[+-][0-2]\d:[0-5]\d|Z)$/),
        description: testArticle.description,
        favorited: false,
        favoritesCount: 0,
        slug: testArticle.slug,
        tagList: expect.arrayContaining(testTagList),
        title: testArticle.title,
        updatedAt: expect.stringMatching(/^\d{4,}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d.\d+(?:[+-][0-2]\d:[0-5]\d|Z)$/)
      }
    });
  });

  it('[GET] /feed returns articles created by active user with the most recent first', async () => {
    const testToken = 'test-token';
    const testArticles = [
      {
        created_at: '2022-04-01T13:00:00.000Z',
        created_by: testUser.user_id,
        slug: 'first-article',
        title: 'First article'
      },
      {
        created_at: '2022-04-03T13:00:00.000Z',
        created_by: testUser.user_id,
        slug: 'second-article',
        title: 'Second article'
      }
    ] as const;

    await getArticleDb()
      .whereIn('slug', testArticles.map(({ slug }) => slug))
      .delete();
    await getUserDb().insert({ ...testUser, token: testToken });
    await getArticleDb().insert(testArticles);

    const reply = await server.inject({
      headers: { authorization: `Bearer ${testToken}` },
      method: 'GET',
      path: '/feed'
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
    expect(reply.json()).toEqual({
      articles: expect.arrayContaining([
        {
          author: testUser.username,
          body: null,
          createdAt: testArticles[1].created_at,
          description: null,
          favorited: false,
          favoritesCount: 0,
          slug: testArticles[1].slug,
          tagList: [],
          title: testArticles[1].title,
          updatedAt: expect.any(String)
        },
        {
          author: testUser.username,
          body: null,
          createdAt: testArticles[0].created_at,
          description: null,
          favorited: false,
          favoritesCount: 0,
          slug: testArticles[0].slug,
          tagList: [],
          title: testArticles[0].title,
          updatedAt: expect.any(String)
        }
      ]),
      articlesCount: expect.any(Number)
    });
    expect(reply.json().articlesCount).toBeGreaterThanOrEqual(2);
  });
});
