import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import apiRoutes from './routes/api.js';
import { seedDatabase } from './seed.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploaded images
const uploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// Static files for frontend (Stepplify root)
const frontendPath = path.join(__dirname, '../../');
app.use(express.static(frontendPath));

// API routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Stepplify Backend API',
    timestamp: new Date().toISOString(),
  });
});

// Start server and seed database
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 Stepplify Backend Server running on port ${PORT}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`📁 File Uploads URL: http://localhost:${PORT}/uploads`);
  console.log(`=======================================================`);

  // Seed sample database entries if table is empty
  await seedDatabase();
});
