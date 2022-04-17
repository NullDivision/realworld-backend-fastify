import fastify from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { getArticleDb, getUserDb } from '../../data';
import { router } from './slug';

const server = fastify();

server.decorate('authenticate', async (request: any) => {
  if (!request.headers.authorization) {
    throw new Error('Missing authorization header');
  }
})

const testUser = {
  email: 'slug-user@test.com',
  password: 'test-slug-password',
  token: 'test-slug-token',
  user_id: 2,
  username: 'testuser69-slug'
};

describe('Article slug router', () => {
  beforeAll(async () => {
    await server.register(router, { prefix: '/:slug' });

    await getUserDb().where({ username: testUser.username }).delete();
    await getUserDb().insert(testUser);
  });

  beforeEach(async () => {
    // Remove articles each time to make sure there are no false positives
    await getArticleDb().delete();
  });

  it('[GET] /{{slug}} returns a single article', async () => {
    const testSlug = 'my-first-post';

    await getArticleDb().insert({
      created_by: testUser.user_id,
      slug: testSlug,
      title: 'My first post'
    });

    const reply = await server.inject({
      method: 'GET',
      path: `/${testSlug}`
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
    expect(reply.json()).toEqual({
      article: {
        author: testUser.username,
        body: null,
        createdAt: expect.any(String),
        description: null,
        favorited: false,
        favoritesCount: 0,
        slug: testSlug,
        tagList: [],
        title: 'My first post',
        updatedAt: expect.any(String)
      }
    });
  });

  it('[PUT] /{{slug}} updates and returns a single article', async () => {
    const testBody = '...and then there was more';

    await getArticleDb().insert({
      created_by: testUser.user_id,
      slug: 'my-first-post',
      title: 'My first post'
    });

    const reply = await server.inject({
      headers: { authorization: `Bearer ${testUser.token}` },
      method: 'PUT',
      path: '/my-first-post',
      payload: { article: { body: testBody } }
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
    expect(reply.json()).toEqual({
      article: {
        author: testUser.username,
        body: testBody,
        createdAt: expect.any(String),
        description: null,
        favorited: false,
        favoritesCount: 0,
        slug: 'my-first-post',
        tagList: [],
        title: 'My first post',
        updatedAt: expect.any(String)
      }
    });
  });

  it('[POST] /{{slug}}/favorite adds article to user favorites and returns the article', async () => {
    await getArticleDb().insert({
      created_by: testUser.user_id,
      slug: 'unfavorited-article',
      title: 'Unfavorited article'
    });

    const reply = await server.inject({
      headers: { 'authorization': `Bearer ${testUser.token}` },
      method: 'POST',
      path: '/unfavorited-article/favorite'
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
    expect(reply.json()).toEqual({ article: expect.any(Object) });
  });
});
