/**
 * ACADENO LMS — EPIC 8 Test Harness (MOCK DB Pool)
 */
const pool = {
  connect: async () => ({
    query: async (sql, params) => {
        console.log(`[QUERY_EXECUTED]: ${sql.substring(0, 100)}...`);
        // Mocking successful creation and list results
        if (sql.includes('INSERT INTO batches')) {
            return { rows: [{ id: 'mock-batch-1', name: params[1], batch_code: params[2] }] };
        }
        if (sql.includes('SELECT b.*')) {
            return { rows: [
                { id: 'mock-batch-1', name: 'Autumn Morning', batch_code: 'AC-101', status: 'upcoming', capacity: 20, start_date: '2026-09-01' }
            ] };
        }
        if (sql.includes('SELECT COUNT(*)')) {
            return { rows: [{ count: '12' }] };
        }
        if (sql.includes('SELECT * FROM system_settings')) {
            return { rows: [
                { key: 'gst_rate', value: '18', is_sensitive: false, description: 'Standard GST rate applied to all invoices' },
                { key: 'invoice_prefix', value: 'AC-2026-', is_sensitive: false, description: 'Prefix for auto-generated student invoices' },
                { key: 'razorpay_secret', value: 'sk_test_51...99', is_sensitive: true, description: 'Razorpay Webhook/API Secret for payment verification' }
            ] };
        }
        if (sql.includes('SELECT cp.*') || sql.includes('FROM trainer_course_pool')) {
            return { rows: [
                { id: 't-1', name: 'Ayush Sharma', email: 'ayush@example.com', active_batch_count: 2 },
                { id: 't-2', name: 'John Doe', email: 'john@example.com', active_batch_count: 0 },
                { id: 't-3', name: 'Jane Smith', email: 'jane@example.com', active_batch_count: 1 }
            ] };
        }
        if (sql.includes('UPDATE batches SET trainer_id')) {
            return { rows: [] };
        }
        return { rows: [] };
    },
    release: () => {}
  })
};

module.exports = { pool };
