/**
 * ACADENO LMS — EPIC 8 Database Wrapper (Fallback Mock)
 */

let pool;

try {
    // If running inside the main project, use the shared pool
    pool = require('../../src/db/index').pool;
} catch (e) {
    // If running in modular/standalone mode, use mock pool
    pool = {
        connect: async () => ({
            query: async (sql, params) => {
                console.log(`[MOCK_DB]: ${sql.substring(0, 100)}...`);
                // Return dummy data for standalone testing
                if (sql.includes('SELECT b.*')) return { rows: [{ id: 'mock-1', name: 'Mock Batch', status: 'upcoming', capacity: 30 }] };
                if (sql.includes('INSERT')) return { rows: [{ id: 'new-id', ...params }] };
                return { rows: [] };
            },
            release: () => {}
        })
    };
}

module.exports = { pool };
