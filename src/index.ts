import { server } from './server';

server.listen(3000, '0.0.0.0', (error, address) => {
    if (error) {
        console.error(error);
    }

    console.info(`Starting server @ ${address}`);
});
