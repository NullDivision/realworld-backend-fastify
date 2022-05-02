/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('followers', (table) => {
    table
      .integer('user_id')
      .unsigned()
      .index()
      .references('user_id')
      .inTable('users');
    table
      .integer('following_id')
      .unsigned()
      .index()
      .references('user_id')
      .inTable('users');
    table.unique(['following_id', 'user_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('followers');
};
