require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const initQueueSocket = require('./sockets/queueSocket');

const app = express();
const server = http.createServer(app);

// Enable CORS for frontend requests (local client runs on port 5173 by default for Vite)
app.use(cors({
  origin: '*', // For hackathon demo simplicity, allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

// Routes configuration
app.use('/api/token', require('./routes/tokenRoutes'));
app.use('/api/facility', require('./routes/facilityRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Standalone redirect suggestion endpoint per AGENTS.md requirements
app.get('/api/redirect-suggestion', require('./controllers/queueController').getRedirects);

// Root endpoint check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    dbState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Attach socketio instance to app context so we can access it inside controllers
app.set('socketio', io);

// Initialize live queue socket events
initQueueSocket(io);

// DB Connection Function with Memory Server Fallback
async function startServer() {
  const PORT = process.env.PORT || 5000;
  
  // Try to connect to DB
  const MONGODB_URI = process.env.MONGODB_URI;
  let dbConnected = false;

  if (MONGODB_URI) {
    try {
      console.log(`Connecting to MONGODB_URI: ${MONGODB_URI}...`);
      // Add standard connection options
      await mongoose.connect(MONGODB_URI);
      console.log('Connected to MongoDB database.');
      dbConnected = true;
    } catch (error) {
      console.error('Failed to connect to external MongoDB:', error.message);
    }
  }

  // Fallback to MongoMemoryServer if external db failed or was not specified
  if (!dbConnected) {
    console.log('Attempting fallback to in-memory MongoDB...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
      const inMemoryUri = mongoServer.getUri();
      console.log(`In-memory MongoDB spawned at: ${inMemoryUri}`);
      await mongoose.connect(inMemoryUri);
      console.log('Connected to in-memory database.');

      // Auto-seed in-memory DB since it starts empty
      console.log('Auto-seeding demo data...');
      const seedDatabase = require('./scripts/seed');
      await seedDatabase(inMemoryUri);
      console.log('Auto-seeding complete.');
    } catch (err) {
      console.error('CRITICAL: Failed to initialize database fallback:', err.message);
      console.log('Warning: Database operations will fail without a running database.');
    }
  }

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`Queue Balancer backend listening on port ${PORT}`);
  });
}

startServer();
