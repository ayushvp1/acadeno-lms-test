const express = require('express');
const cors    = require('cors');

/**
 * ACADENO LMS — EPIC 8 Backend Test Harness
 */
const app = express();
app.use(express.json());
app.use(cors());

// --- Mock Middleware ---
const authenticate = (req, res, next) => {
    // Hardcode user and super_admin role for testing
    req.user = { user_id: 'master-admin-uuid', role: 'super_admin' };
    next();
};

const authorize = (role) => (req, res, next) => next(); // Pass all for testing

// Inject mock db to controllers
const { pool } = require('./db/index');
// Overriding global controllers that expect '../db/index'
// Actually, our epic8_backend controllers use require('../db/index')
// So we must place the controllers in a folder where they can resolve it.
// I'll copy our modular controllers to a temporary test folder.

const batchRoutes = require('../../epic8_backend/routes/batches');
const hrRoutes    = require('../../epic8_backend/routes/hr');
const adminRoutes = require('../../epic8_backend/routes/admin');

// Note: This harness setup assumes the file structure in our integration guide.
// We'll use these routes directly...
app.use('/api/batches', batchRoutes);
app.use('/api/hr',      hrRoutes);
app.use('/api/admin',   adminRoutes);

app.get('/health', (req, res) => res.json({ status: 'EPIC-8 STANDALONE READY' }));

app.listen(5555, () => {
    console.log('🚀 EPIC-8 Test Server running on http://localhost:5555');
});
