import fastify from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { getArticleDb, getFavoritesDb, getTagsDb, getUserDb } from '../../data';
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
const testArticle = {
  created_by: testUser.user_id,
  slug: 'slug-test-slug',
  title: 'Slug test article'
};

describe('Article slug router', () => {
  beforeAll(async () => {
    await server.register(router, { prefix: '/:slug' });

    await getUserDb().where({ username: testUser.username }).delete();
    await getUserDb().insert(testUser);
  });

  beforeEach(async () => {
    // Remove articles each time to make sure there are no false positives
    await getArticleDb().where('slug', testArticle.slug).delete();
    await getArticleDb().insert(testArticle);
    await getFavoritesDb().where('article_slug', testArticle.slug).delete();
    await getTagsDb().where('article_slug', testArticle.slug).delete();
  });

  it('[GET] /{{slug}} returns a single article', async () => {
    const reply = await server.inject({
      method: 'GET',
      path: `/${testArticle.slug}`
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
        slug: testArticle.slug,
        tagList: [],
        title: testArticle.title,
        updatedAt: expect.any(String)
      }
    });
  });

  it('[PUT] /{{slug}} updates and returns a single article', async () => {
    const testBody = '...and then there was more';

    const reply = await server.inject({
      headers: { authorization: `Bearer ${testUser.token}` },
      method: 'PUT',
      path: `/${testArticle.slug}`,
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
        slug: testArticle.slug,
        tagList: [],
        title: testArticle.title,
        updatedAt: expect.any(String)
      }
    });
  });

  it('[POST] /{{slug}}/favorite adds article to user favorites and returns the article', async () => {
    const reply = await server.inject({
      headers: { 'authorization': `Bearer ${testUser.token}` },
      method: 'POST',
      path: `/${testArticle.slug}/favorite`
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
    expect(reply.json()).toEqual({ article: expect.any(Object) });
  });

  it('[DELETE] /{{slug}}/favorite removes the article from user favorites and returns the article', async () => {
    await getFavoritesDb().insert({
      article_slug: testArticle.slug,
      user_id: testUser.user_id
    });

    const reply = await server.inject({
      headers: { authorization: `Bearer ${testUser.token}` },
      method: 'DELETE',
      path: `/${testArticle.slug}/favorite`
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
    expect(reply.json()).toEqual({
      article: expect.objectContaining({ favorited: false })
    });
  });
});
