import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth';
import languageRoutes from './routes/languages';
import examRoutes from './routes/exams';
import subjectRoutes from './routes/subjects';
import topicRoutes from './routes/topics';
import questionRoutes from './routes/questions';
import testRoutes from './routes/tests';
import attemptRoutes from './routes/attempts';
import analyticsRoutes from './routes/analytics';
import savedQuestionsRoutes from './routes/savedQuestions';
import mistakesRoutes from './routes/mistakes';
import marathonRoutes from './routes/marathon';
import dailyPracticeRoutes from './routes/dailyPractice';
import customTestRoutes from './routes/customTest';
import userRoutes from './routes/user';
import walletRoutes from './routes/wallet';
import subscriptionRoutes from './routes/subscription';
import referralRoutes from './routes/referral';
import adminRoutes from './routes/admin';
import resourceRoutes from './routes/resources';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
    origin: [
        'https://sahpathi-ai.vercel.app',
        'https://sahpathi.ai',
        'http://localhost:5173',
        process.env.CLIENT_URL
    ].filter((origin): origin is string => !!origin && origin !== 'undefined'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/languages', languageRoutes);


app.use('/api/exams', examRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/saved-questions', savedQuestionsRoutes);
app.use('/api/mistakes', mistakesRoutes);
app.use('/api/marathon', marathonRoutes);
app.use('/api/daily-practice', dailyPracticeRoutes);
app.use('/api/custom-test', customTestRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/resources', resourceRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
});

app.listen(PORT, () => {
    console.log(`🚀 Sahpathi API Server running on port ${PORT}`);
    console.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
