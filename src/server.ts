import { compare, genSalt, hash } from 'bcrypt';
import fastify, {
    FastifyReply,
    FastifyRequest,
    onRequestAsyncHookHandler
} from 'fastify';
import jwt from 'fastify-jwt';
import { StatusCodes } from 'http-status-codes';
import type { FromSchema } from 'json-schema-to-ts';
import { User, db } from './data';

export const server = fastify();

// It sucks every year, this is just the most recent
server.register(jwt, { prefix: 'Token', secret: 'jssucks-2022' });

server.addHook('onRequest', (request, reply, done) => {
    if (request.headers.authorization?.startsWith('Token ')) {
        request.headers.authorization = request.headers.authorization.replace('Token', 'Bearer');
    }

    done();
});

server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        await request.jwtVerify();
    } catch (error) {
        reply.code(StatusCodes.UNAUTHORIZED).send(error);
    }
});

declare module 'fastify' {
    export interface FastifyInstance {
        authenticate: onRequestAsyncHookHandler;
    }
}

const getTokenizedUserByEmail = (email: string) =>
    db<User>('user').where('email', email).first();

const getTokenizedUserByToken = (token: string) => {
    if (!token) {
        throw new Error('Must use valid token to prevent false positives');
    }

    return db<User>('user').where('token', token).first();
}

const CreateRequestBodySchema = {
    properties: {
        user: {
            properties: {
                email: { type: 'string' },
                password: { type: 'string' },
                username: { type: 'string' }
            },
            required: ['email', 'password', 'username'],
            type: 'object'
        }
    },
    required: ['user'],
    type: 'object'
} as const;

type TokenizedUser = Omit<User, 'password' | 'id'>

interface UsersPostGeneric {
    Body: FromSchema<typeof CreateRequestBodySchema>
    Reply: {
        user: TokenizedUser | null
    }
}

server.post<UsersPostGeneric>('/users', {
    handler: async ({ body }, reply) => {
        try {
            const salt = await genSalt(10);

            await db<User>('user').insert({
                email: body.user.email,
                password: await hash(body.user.password, salt),
                username: body.user.username
            });

            const result = await getTokenizedUserByEmail(body.user.email);

            if (!result) throw new Error('Could not insert user');

            reply
                .code(StatusCodes.CREATED)
                .send({
                    user: {
                        bio: result.bio,
                        email: result.email,
                        image: result.image,
                        token: result.token,
                        username: result.username
                    }
                });
        } catch (error) {
            console.error(error);

            return reply.code(StatusCodes.INTERNAL_SERVER_ERROR);
        }
    },
    schema: { body: CreateRequestBodySchema }
});

const LoginRequestBodySchema = {
    properties: {
        user: {
            properties: {
                email: { type: 'string' },
                password: { type: 'string' }
            },
            required: ['email', 'password'],
            type: 'object'
        }
    },
    required: ['user'],
    type: 'object'
} as const;

interface LoginGeneric {
    Body: FromSchema<typeof LoginRequestBodySchema>;
    Reply: { user: TokenizedUser | null };
}

server.post<LoginGeneric>('/users/login', {
    handler: async (request, reply) => {
        const user = await getTokenizedUserByEmail(request.body.user.email);

        if (!user) return reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

        const { id, password, ...tokenizedUser } = user;
        const isValidPassword = await compare(
            request.body.user.password,
            user.password
        );

        if (!isValidPassword) return reply.code(StatusCodes.UNAUTHORIZED).send();

        const token = server.jwt.sign({ payload: {} });

        await db<User>('user')
            .where('email', user.email)
            .update('token', token);

        reply.code(StatusCodes.CREATED).send({ user: { ...tokenizedUser, token } });
    },
    schema: { body: LoginRequestBodySchema }
});

interface GetUserGeneric { Reply: { user: TokenizedUser | null } }

server.get<GetUserGeneric>('/user', {
    handler: async (request, reply) => {
        const token = request.headers.authorization?.replace('Bearer ', '');

        if (!token) return reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

        const user = await getTokenizedUserByToken(token);

        if (!user) return reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

        reply.code(StatusCodes.OK).send({ user });
    },
    onRequest: [server.authenticate]
});

const UpdateRequestBodySchema = {
    properties: {
        user: {
            properties: {
                bio: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' }
            },
            type: 'object'
        }
    },
    type: 'object'
} as const;

interface UserUpdateGeneric {
    Body: FromSchema<typeof UpdateRequestBodySchema>;
    Reply: { user: TokenizedUser | null }
}

server.put<UserUpdateGeneric>('/user', {
    handler: async (request, reply) => {
        const token = request.headers.authorization?.replace('Bearer ', '');

        if (!token || !request.body.user) {
            return reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });
        }

        await db<User>('user').where('token', token).update(request.body.user);

        const user = await getTokenizedUserByToken(token);

        if (!user) return reply.code(StatusCodes.UNAUTHORIZED).send({ user: null });

        const { id, password, ...tokenizedUser } = user;

        reply.code(StatusCodes.OK).send({ user: tokenizedUser });
    },
    onRequest: [server.authenticate]
});
