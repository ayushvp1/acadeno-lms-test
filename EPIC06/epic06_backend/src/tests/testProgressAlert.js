/**
 * Verification Script for US-NOT-03 Progress Alert Job
 * Run with: node src/tests/testProgressAlert.js
 */
require('dotenv').config();
const { processProgressAlerts } = require('../jobs/progressAlertJob');

async function runTest() {
    console.log('--- Starting Progress Alert Verification ---');
    try {
        // This will attempt a live run against the local DB.
        // It will use real criteria: completion < 40% OR 3+ overdue tasks.
        await processProgressAlerts();
        console.log('SUCCESS: Progress alert job executed logically.');
    } catch (err) {
        console.error('FAILURE:', err.message);
        process.exit(1);
    }
    console.log('--- Verification Finished ---');
}

runTest();
