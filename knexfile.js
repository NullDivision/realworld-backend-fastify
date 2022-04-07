// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './data/database.sqlite3'
    },
    migrations: { filename: './data/migrations' },
    useNullAsDefault: true
  },
  test: {
    client: 'sqlite3',
    connection: { filename: './data/database-test.sqlite3' },
    migrations: { filename: './data/migrations' },
    useNullAsDefault: true
  }
};
