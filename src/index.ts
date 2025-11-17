import app from './app';
import { appConfig } from './connections/config/app.config';

const PORT = appConfig.port;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${appConfig.nodeEnv}`);
});
