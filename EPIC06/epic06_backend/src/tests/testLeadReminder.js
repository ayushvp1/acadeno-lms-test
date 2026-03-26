/**
 * Verification Script for US-NOT-04 Lead Follow-Up Reminders
 * Run with: node src/tests/testLeadReminder.js
 */
require('dotenv').config();
const { processLeadFollowUpReminders } = require('../jobs/leadFollowUpJob');

async function runTest() {
    console.log('--- Starting Lead Follow-Up Verification ---');
    try {
        // This will attempt a live run against the local DB.
        // It will use real criteria: follow_up_date = TODAY or TODAY - 3 (inactive).
        await processLeadFollowUpReminders();
        console.log('SUCCESS: Lead follow-up job executed logically.');
    } catch (err) {
        console.error('FAILURE:', err.message);
        process.exit(1);
    }
    console.log('--- Verification Finished ---');
}

runTest();
