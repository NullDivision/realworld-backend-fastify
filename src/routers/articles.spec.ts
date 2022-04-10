import fastify from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { getArticleDb, getTagsDb, getUserDb } from '../data';
import { router } from './articles';

const server = fastify({ logger: true });

server.decorate('authenticate', async () => {})
server.register(router);

const testUser = {
  email: 'user@test.com',
  password: 'test-password',
  user_id: 1,
  username: 'testuser69'
};

describe('Articles router', () => {
  beforeEach(async () => {
    await getArticleDb().delete();
    await getTagsDb().delete();
  });

  describe('[GET] /', () => {
    it('returns a list of articles', async () => {
      const testCreateDate = '2022-04-06T17:46:24.000Z'
      const testUpdateDate = '2022-04-06T17:46:24.000Z'
      const testArticle = {
        body: 'Test body',
        created_at: testCreateDate,
        created_by: testUser.user_id,
        description: 'Test description',
        slug: 'test-article',
        title: 'Test article',
        updated_at: testUpdateDate
      };

      await getUserDb().delete();
      await getUserDb().insert([testUser]);
      await getArticleDb().delete();
      await getArticleDb().insert([testArticle]);
      await getTagsDb().delete();
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
        articles: [{
          author: testUser.username,
          body: testArticle.body,
          createdAt: testCreateDate,
          description: testArticle.description,
          favorited: false,
          favoritesCount: 0,
          slug: testArticle.slug,
          tagList: ['test'],
          title: testArticle.title,
          updatedAt: testUpdateDate
        }],
        articlesCount: 1
      });
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

      await getArticleDb().delete();
      await getArticleDb().insert([testValidArticle, testInvalidArticle]);

      const reply = await server.inject({
        method: 'GET',
        path: '/',
        query: { author: testUser.username }
      });

      expect(reply.json()).toEqual({
        articles: [{
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
        }],
        articlesCount: 1
      });
    });
  });

  it('[POST] / stores and returns the article', async () => {
    const testToken = 'test-token';
    const testArticle = {
      body: 'The first one!',
      description: 'A long time ago in a galaxy far away',
      tagList: ['sci-fi', 'original'],
      title: 'Star Wars: A New Hope'
    };

    await getUserDb().delete();
    await getUserDb().insert({ ...testUser, token: testToken });

    const reply = await server.inject({
      headers: { authorization: `Bearer ${testToken}` },
      method: 'POST',
      path: '/',
      payload: {
        article: testArticle
      }
    });

    expect(reply.statusCode).toBe(StatusCodes.CREATED);
    expect(reply.json()).toEqual({
      article: {
        author: testUser.username,
        body: testArticle.body,
        createdAt: expect.any(String),
        description: testArticle.description,
        favorited: false,
        favoritesCount: 0,
        slug: 'star-wars-a-new-hope',
        tagList: testArticle.tagList,
        title: testArticle.title,
        updatedAt: expect.any(String)
      }
    });
  });
});
