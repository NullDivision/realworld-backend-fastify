import fastify from 'fastify';
import { getArticleDb, getTagsDb, getUserDb } from '../data';
import { router } from './articles';

const server = fastify();

server.register(router);

const testUser = {
  email: 'user@test.com',
  password: 'test-password',
  user_id: 1,
  username: 'testuser69'
};

describe('Articles router', () => {
  describe('[GET] /', () => {
    it('returns a list of articles', async () => {
      const testCreateDate = '2022-04-06T17:46:24Z'
      const testUpdateDate = '2022-04-06T17:46:24Z'
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
          slug: testArticle.slug,
          tagList: ['test'],
          title: testArticle.title,
          updatedAt: testUpdateDate
        }],
        articlesCount: 1
      });
    });

    it('filters articles by author', async () => {
      const testCreateDate = '2022-04-06T17:46:24Z'
      const testUpdateDate = '2022-04-06T17:46:24Z'
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
          slug: testValidArticle.slug,
          tagList: [],
          title: testValidArticle.title,
          updatedAt: testUpdateDate
        }],
        articlesCount: 1
      });
    });
  });
});
