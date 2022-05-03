// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
  development: {
    client: 'sqlite3',
    connection: { filename: './data/database.sqlite3' },
    migrations: { filename: './migrations' },
    seeds: { directory: './seeds' },
    useNullAsDefault: true
  },
  test: {
    client: 'sqlite3',
    // Since Jest runs multiple suites in parallel using a file can lead to lockups
    // Using memory means each suite gets its own throwaway db
    connection: ':memory:',
    migrations: { filename: './migrations' },
    useNullAsDefault: true
  }
};
