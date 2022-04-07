import { server } from './server';

server.listen(3000, '0.0.0.0', (error, address) => {
  if (error != null) {
    console.error(error);
  }

  console.info(`Starting server @ ${address}`);
});
