# ![RealWorld Example App](logo.png)

> ### Fastify codebase containing real world examples (CRUD, auth, advanced patterns, etc) that adheres to the [RealWorld](https://github.com/gothinkster/realworld) spec and API.


### [Demo](https://demo.realworld.io/)&nbsp;&nbsp;&nbsp;&nbsp;[RealWorld](https://github.com/gothinkster/realworld)


This codebase was created to demonstrate a fully fledged fullstack application built with **Fastify** including CRUD operations, authentication, routing, pagination, and more.

We've gone to great lengths to adhere to the **Fastify** community styleguides & best practices.

For more information on how to this works with other frontends/backends, head over to the [RealWorld](https://github.com/gothinkster/realworld) repo.


# How it works

The application is split up into three main components:
- the routes/ directory contains individual resource routers
- data.ts contains most of the database related bits
- server is the core fastify app

# Getting started

This package uses Knex and SQLite. In order to use it simply run the following:
> yarn knex migrate:latest

Once migrations have been done you can run the application using `yarn start`

