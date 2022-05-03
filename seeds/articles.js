const { faker } = require('@faker-js/faker');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function(knex) {
  const users = new Array(3)
    .fill()
    .map((value, index) => ({
      email: faker.internet.email(),
      // Bcrypt encoding with 10 rounds salt - conduit2022
      password: '$2b$10$73n0ukDOVQcjL7VSxHiKZuJkI//NDoGwafJIIdqre5azWRhHITugm',
      user_id: index + 1,
      username: faker.internet.userName()
    }));

  await knex('users').del();
  await knex('users').insert(users);

  await knex('articles').del();
  await knex('articles').insert(new Array(20)
    .fill()
    .map(() => ({
      body: faker.lorem.paragraphs(),
      created_by: users[Math.floor(Math.random() * 3)].user_id,
      slug: faker.lorem.slug(),
      title: faker.lorem.words()
    })));
};
