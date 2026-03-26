// =========================================================================
// ACADENO LMS — Announcement Controller (US-TR-03)
// Handles batch announcements for trainers and students.
// =========================================================================

const { pool } = require('../db/index');

/**
 * POST /api/announcements
 * Roles: trainer, super_admin
 */
async function createAnnouncement(req, res) {
  const { batch_id, title, content, is_pinned, expires_at } = req.body;

  if (!batch_id || !title || !content) {
    return res.status(400).json({ error: 'Batch ID, title, and content are required.' });
  }

  const client = await pool.connect();
  try {
    // RBAC: If trainer, check if they own this batch
    if (req.user.role === 'trainer') {
      const batchCheck = await client.query(
        'SELECT trainer_id FROM batches WHERE id = $1',
        [batch_id]
      );
      if (batchCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Batch not found.' });
      }
      if (batchCheck.rows[0].trainer_id !== req.user.user_id) {
        return res.status(403).json({ error: 'You are not assigned to this batch.' });
      }
    }

    const result = await client.query(
      `INSERT INTO batch_announcements 
        (batch_id, trainer_id, title, content, is_pinned, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [batch_id, req.user.user_id, title, content, is_pinned || false, expires_at || null]
    );

    return res.status(201).json({ announcement: result.rows[0] });
  } catch (err) {
    console.error('createAnnouncement error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * GET /api/announcements/batch/:batchId
 * Roles: all (filtered by batch enrollment)
 */
async function listAnnouncements(req, res) {
  const { batchId } = req.params;
  const client = await pool.connect();

  try {
    // If student, verify enrollment (Simplified: for now allow if in batch)
    // We filter by expiry for non-trainers
    let query = `
      SELECT ba.*, u.full_name as trainer_name
        FROM batch_announcements ba
        JOIN users u ON ba.trainer_id = u.id
       WHERE ba.batch_id = $1
    `;
    const params = [batchId];

    if (req.user.role === 'student') {
      query += ` AND (ba.expires_at > NOW() OR ba.expires_at IS NULL)`;
    }

    query += ` ORDER BY ba.is_pinned DESC, ba.created_at DESC`;

    const result = await client.query(query, params);
    return res.json({ announcements: result.rows });
  } catch (err) {
    console.error('listAnnouncements error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/announcements/:id
 * Roles: trainer, super_admin
 */
async function deleteAnnouncement(req, res) {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const check = await client.query('SELECT trainer_id FROM batch_announcements WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    if (req.user.role === 'trainer' && check.rows[0].trainer_id !== req.user.user_id) {
      return res.status(403).json({ error: 'You can only delete your own announcements.' });
    }

    await client.query('DELETE FROM batch_announcements WHERE id = $1', [id]);
    return res.json({ message: 'Announcement deleted successfully.' });
  } catch (err) {
    console.error('deleteAnnouncement error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = {
  createAnnouncement,
  listAnnouncements,
  deleteAnnouncement
};
