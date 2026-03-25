require('dotenv').config();
const app = require('./app');
const { pool } = require('./db/index');
const redis = require('./utils/redis');

// ==========================================================================
// ACADENO LMS — Server Entry Point
// ==========================================================================
// Connects to Postgres and Redis before starting the Express server.
// Registers background cron jobs after successful startup.
// ==========================================================================

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // 1. Test PostgreSQL connection
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');
    client.release();

    // 2. Test Redis connection
    await redis.ping();
    console.log('✅ Redis connected successfully');

    // 3. Register background jobs
    require('./jobs/leadArchiveJob').startLeadJobs();
    require('./jobs/liveSessionReminderJob').startLiveSessionReminderJob();

    // 4. Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

