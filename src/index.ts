import app from './app';
import { appConfig } from './connections/config/app.config';
import { connectDatabase, connectRedis, initializeFirebase } from './connections';
import { logger } from './utils/logging';

const PORT = appConfig.port;

/**
 * Initialize connections and start server
 */
const startServer = async () => {
  try {
    logger.info('Initializing connections...');
    
    // Initialize Firebase Admin
    logger.info('Initializing Firebase Admin...');
    initializeFirebase();
    
    // Connect to database
    logger.info('Connecting to database...');
    await connectDatabase();
    
    // Connect to Redis
    logger.info('Connecting to Redis...');
    await connectRedis();
    
    // Start server
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${appConfig.nodeEnv}`);
      logger.info('All services are ready!');
    });
  } catch (error: any) {
    logger.error('Failed to start server:', { error: error.message, stack: error.stack });
    logger.error('Exiting application...');
    process.exit(1);
  }
};

// Start the application
startServer();
