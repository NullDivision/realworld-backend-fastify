import knex from 'knex';

if (!process.env['NODE_ENV']) throw new Error('Invalid environment');

export interface User {
    bio: string | null;
    email: string;
    id: number;
    image: string | null;
    password: string;
    token: string | null;
    username: string;
}

console.info(`Setting up database for '${process.env['NODE_ENV']}' environment`);
export const db = knex(require('../knexfile.js')[process.env['NODE_ENV']]);
