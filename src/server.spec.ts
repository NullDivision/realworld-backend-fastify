import { StatusCodes } from 'http-status-codes';
import { getArticleDb, getTagsDb, getUserDb } from './data';
import { server } from './server';

const testUser = {
  email: 'user@test.com',
  password: 'test-password',
  user_id: 1,
  username: 'testuser69'
};

describe('Server', () => {
  describe('/users', () => {
      beforeEach(async () => {
          await getUserDb().where('username', testUser.username).delete();
      });

      it('[POST] /users registers a new user and returns it', async () => {
          const reply = await server.inject({
              method: 'POST',
              path: '/users',
              payload: { user: testUser }
          });

          expect(reply.statusCode).toBe(StatusCodes.CREATED);
          expect(reply.json().user).toEqual({
              bio: null,
              email: testUser.email,
              image: null,
              token: null,
              username: testUser.username
          });
      });

      describe('[POST] /users/login', () => {
          beforeEach(async () => {
              await server.inject({
                  method: 'POST',
                  path: '/users',
                  payload: { user: testUser }
              });
          });

          it('returns user on success', async () => {
              const reply = await server.inject({
                  method: 'POST',
                  path: '/users/login',
                  payload: {
                      user: {
                          email: testUser.email,
                          password: testUser.password
                      }
                  }
              });

              expect(reply.statusCode).toBe(201);
              expect(reply.json()).toEqual({
                  user: {
                      bio: null,
                      email: testUser.email,
                      image: null,
                      token: expect.any(String),
                      username: testUser.username
                  }
              });
          });

          it('returns a rejection on failed login', async () => {
              const reply = await server.inject({
                  method: 'POST',
                  path: '/users/login',
                  payload: {
                      user: {
                          email: testUser.email,
                          password: 'invalid-password'
                      }
                  }
              });

              expect(reply.statusCode).toBe(StatusCodes.UNAUTHORIZED);
          });
      });
  });

  describe('/user', () => {
      // Recreate the user to ensure it's fresh
      beforeEach(async () => {
          await getUserDb().where('username', testUser.username).delete()

          await server.inject({
              method: 'POST',
              path: '/users',
              payload: { user: testUser }
          });
      });

      it('[GET] /user returns the current logged in user', async () => {
          const loginReply = await server.inject({
              method: 'POST',
              path: '/users/login',
              payload: {
                  user: {
                      email: testUser.email,
                      password: testUser.password
                  }
              }
          });

          const reply = await server.inject({
              headers: { authorization: `Token ${loginReply.json().user.token}` },
              method: 'GET',
              path: '/user'
          });

          expect(reply.statusCode).toBe(200);
      });

      it('[PUT] /user updates user and returns new values', async () => {
          const loginReply = await server.inject({
              method: 'POST',
              path: '/users/login',
              payload: {
                  user: {
                      email: testUser.email,
                      password: testUser.password
                  }
              }
          });

          const reply = await server.inject({
              headers: { authorization: `Token ${loginReply.json().user.token}` },
              method: 'PUT',
              path: '/user',
              payload: { user: { email: 'new-mail@test.com' } }
          });

          expect(reply.statusCode).toBe(200);
          expect(reply.json()).toEqual({
              user: {
                  bio: null,
                  email: 'new-mail@test.com',
                  image: null,
                  token: expect.any(String),
                  username: testUser.username
              }
          });
      })
  });

  describe('[GET] /articles', () => {
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
        path: '/articles'
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
        path: '/articles',
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
