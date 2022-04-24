import fastify from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { getArticleDb, getCommentsDb, getFavoritesDb, getTagsDb, getUserDb } from '../../data';
import { router } from './slug';

const server = fastify({ logger: { level: 'error' } });

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

  it('[POST] /{{slug}}/comments adds a comment for a given article', async () => {
    const testPayload = { comment: { body: 'Test comment' } };

    const reply = await server.inject({
      headers: { authorization: `Bearer ${testUser.token}` },
      method: 'POST',
      path: `/${testArticle.slug}/comments`,
      payload: testPayload
    });

    expect(reply.statusCode).toBe(StatusCodes.CREATED);
    expect(reply.json()).toEqual({
      comment: {
        author: testUser.username,
        body: testPayload.comment.body,
        createdAt: expect.stringMatching(/^\d{4,}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d.\d+(?:[+-][0-2]\d:[0-5]\d|Z)$/),
        id: 1,
        updatedAt: expect.stringMatching(/^\d{4,}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d.\d+(?:[+-][0-2]\d:[0-5]\d|Z)$/)
      }
    });
  });

  it('[GET] /{{slug}}/comments returns comments related to article', async () => {
    const reply = await server.inject({
      method: 'GET',
      path: `/${testArticle.slug}/comments`
    });

    expect(reply.statusCode).toBe(StatusCodes.OK);
  });

  it('[DELETE] /{{slug}}/comments/{{commentId}} deletes a comment off an article', async () => {
    const testComment = {
      article_slug: testArticle.slug,
      body: 'test comment',
      comment_id: 1,
      user_id: testUser.user_id
    };

    await getCommentsDb().where('comment_id', testComment.comment_id).delete();
    await getCommentsDb().insert(testComment);

    const reply = await server.inject({
      headers: { authorization: `Bearer ${testUser.token}` },
      method: 'DELETE',
      path: `/${testArticle.slug}/comments/${testComment.comment_id}`
    });

    expect(reply.statusCode).toBe(StatusCodes.NO_CONTENT);

    const commentCount = await getCommentsDb()
      .where('comment_id', testComment.comment_id)
      .count();

    expect(commentCount.at(0)?.['count(*)']).toBe(0);
  });

  it('[DELETE] /{{slug}} deletes an article', async () => {
    const reply = await server.inject({
      headers: { authorization: `Bearer ${testUser.token}` },
      method: 'DELETE',
      path: `/${testArticle.slug}`
    });

    expect(reply.statusCode).toBe(StatusCodes.NO_CONTENT);
  });
});
