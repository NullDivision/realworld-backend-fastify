/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('users', table => {
    table.increments('user_id').primary();
    table.text('bio', 255);
    table.text('email', 255).notNullable();
    table.text('image', 255);
    table.text('token', 255);
    table.text('password', 255).notNullable();
    table.text('username', 255).notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  knex.schema.dropTableIfExists('user');
};
