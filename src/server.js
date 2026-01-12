import 'dotenv/config';

import http from 'http';
import app from './app.js';

const PORT = Number(process.env.PORT) || 5000;

const server = http.createServer(app);

server.listen(PORT, () => {
	console.log(`Raabta backend listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
	server.close(() => process.exit(0));
});
