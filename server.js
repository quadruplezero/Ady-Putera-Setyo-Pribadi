import { createApp } from './src/app.js';

const port = Number(process.env.PORT) || 3000;
const { server } = createApp({
  dbPath: process.env.DB_PATH || 'data/mainbareng.db',
  seed: process.env.SEED !== '0',
});

server.listen(port, () => {
  console.log(`MainBareng berjalan di http://localhost:${port}`);
});
