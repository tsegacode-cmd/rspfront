/**
 * Red Sea Brokerage - Production Server
 * Serves the built React application with Express
 */

import express from 'express';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// API health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Red Sea Brokerage Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// API routes placeholder
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Red Sea Brokerage Platform',
    version: '1.0.0',
    description: 'Fixed and Movable Commission Work and Brokerage Service'
  });
});

// Handle React routing - send all requests to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

const startServer = () => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('  Red Sea Brokerage Server');
    console.log('========================================');
    console.log(`Server running on port ${PORT}`);
    console.log(`Local:   http://localhost:${PORT}`);
    console.log(`Network: http://YOUR_IP:${PORT}`);
    console.log('========================================');
    console.log('Press Ctrl+C to stop the server');
    console.log('========================================');
  });
};

export { app, startServer };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}

export default app;
