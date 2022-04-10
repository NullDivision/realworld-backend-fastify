/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('articles', (table) => {
      table.text('title').notNullable();
      table.text('slug').notNullable().unique();
      table.text('body');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table
        .integer('created_by')
        .unsigned()
        .index()
        .references('user_id')
        .inTable('users');
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.text('description');
    })
    .createTable('articles_tags', table => {
      table
        .text('article_slug')
        .references('slug')
        .inTable('articles');
      table.text('tag').notNullable();
      table.unique(['article_slug', 'tag']);
    })
    .createTable('favorites', table => {
      table
        .integer('user_id')
        .unsigned()
        .references('user_id')
        .inTable('users');
      table.text('article_slug').references('slug').inTable('articles');
      table.unique(['user_id', 'article_slug']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  knex.schema.dropTableIfExists('article');
  knex.schema.dropTableIfExists('articles_tags');
  knex.schema.dropTableIfExists('favorites');
};
