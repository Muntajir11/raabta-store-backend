import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/authRoutes.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
	app.use(morgan('dev'));
}

// Routes
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
	res.status(200).json({
		message: 'Hello from Raabta backend',
		env: process.env.NODE_ENV || 'development',
	});
});

app.get('/health', (req, res) => {
	res.status(200).json({ status: 'ok' });
});

// 404
app.use((req, res) => {
	res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
	const status = Number(err.statusCode || err.status) || 500;
	const message = status >= 500 ? 'Internal server error' : err.message;
	res.status(status).json({ message });
});

export default app;
