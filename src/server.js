import { buildApp } from './app.js';
import { env } from './config/env.js';
import { browserManager } from './services/browser/browser-manager.js';

const startServer = async () => {
  try {
    const app = await buildApp();
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server listening on port ${env.PORT}`);

    // Graceful shutdown
    const shutdown = async () => {
      app.log.info('Shutting down server...');
      await browserManager.closeBrowser();
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

