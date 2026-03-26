// ==========================================================================
// ACADENO LMS — Batch Controller (EPIC-08 Integrated)
// Handles creation, management, and trainer assignment for batches.
// ==========================================================================

const { pool } = require('../db/index'); 
const { createNotification, NOTIFICATION_TYPES } = require('../utils/notificationHelper');
const emailService = require('../services/emailService');

/**
 * US-HR-01: Create a new batch
 */
async function createBatch(req, res) {
  const { 
    course_id, name, batch_code, start_date, end_date, capacity,
    schedule_type, class_days, class_time_start, class_time_end, meeting_url, trainer_id 
  } = req.body;

  // Validation: Start date not in past (BR-C04)
  if (new Date(start_date) < new Date()) {
    return res.status(400).json({ error: 'Start date cannot be in the past' });
  }

  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO batches (
        course_id, name, batch_code, start_date, end_date, capacity,
        schedule_type, class_days, class_time_start, class_time_end, meeting_url, trainer_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'upcoming')
      RETURNING *`,
      [course_id, name, batch_code, start_date, end_date, capacity,
       schedule_type, JSON.stringify(class_days || []), class_time_start, class_time_end, meeting_url, trainer_id]
    );

    await client.query('COMMIT');
    
    // US-TR-08: Notify trainer
    if (trainer_id) {
        await notifyTrainerOfAssignment(client, result.rows[0].id, trainer_id);
    }

    return res.status(201).json({ batch: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Batch code already exists' });
    console.error('CREATE BATCH ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * US-HR-01: List all batches with filters
 */
async function listBatches(req, res) {
  const { course_id, status } = req.query;
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    
    let query = `
      SELECT b.*, c.name as course_name, u.email as trainer_email,
      (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) as enrolled_count
      FROM batches b
      JOIN courses c ON b.course_id = c.id
      LEFT JOIN users u ON b.trainer_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (course_id) {
      params.push(course_id);
      query += ` AND b.course_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND b.status = $${params.length}`;
    }

    const result = await client.query(query, params);
    return res.json({ batches: result.rows });
  } catch (err) {
    console.error('LIST BATCHES ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * US-HR-01: Get batch details
 */
async function getBatch(req, res) {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    const result = await client.query(
      `SELECT b.*, (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) as enrolled_count
       FROM batches b WHERE b.id = $1`, [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Batch not found' });
    return res.json({ batch: result.rows[0] });
  } catch (err) {
    console.error('GET BATCH ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * US-HR-01: Update batch
 */
async function updateBatch(req, res) {
  const { id } = req.params;
  const updates = req.body;
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    
    // Check if course_id change is allowed (only if no enrollments)
    if (updates.course_id) {
        const countRes = await client.query('SELECT COUNT(*) FROM enrollments WHERE batch_id = $1', [id]);
        if (parseInt(countRes.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Cannot change course for a batch with active enrollments' });
        }
    }

    const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 2}`).join(', ');
    const params = [id, ...Object.values(updates)];

    const result = await client.query(
      `UPDATE batches SET ${fields} WHERE id = $1 RETURNING *`,
      params
    );

    // US-TR-08: Notify trainer
    if (updates.trainer_id) {
        await notifyTrainerOfAssignment(client, id, updates.trainer_id);
    }

    return res.json({ batch: result.rows[0] });
  } catch (err) {
    console.error('UPDATE BATCH ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * US-HR-02: Assign trainer to batch
 */
async function assignTrainer(req, res) {
  const { id } = req.params;
  const { trainer_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    
    // Validate trainer is in pool for this course
    const poolCheck = await client.query(
        `SELECT cp.* FROM trainer_course_pool cp 
         JOIN batches b ON cp.course_id = b.course_id 
         WHERE b.id = $1 AND cp.trainer_id = $2`,
        [id, trainer_id]
    );
    if (poolCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Trainer is not approved for this course pool' });
    }

    await client.query('UPDATE batches SET trainer_id = $2 WHERE id = $1', [id, trainer_id]);
    
    // US-TR-08: Notify trainer
    await notifyTrainerOfAssignment(client, id, trainer_id);
    
    return res.json({ message: 'Trainer assigned successfully' });
  } catch (err) {
    console.error('ASSIGN TRAINER ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * US-HR-04: Manage Trainer Pool
 */
async function listTrainerPool(req, res) {
    const { courseId } = req.params;
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
        const result = await client.query(
            `SELECT u.id, u.email, u.full_name as name,
             (SELECT COUNT(*) FROM batches b WHERE b.trainer_id = u.id AND b.status = 'active') as active_batch_count
             FROM trainer_course_pool cp
             JOIN users u ON cp.trainer_id = u.id
             WHERE cp.course_id = $1`,
            [courseId]
        );
        return res.json({ trainers: result.rows });
    } catch (err) {
        console.error('LIST TRAINER POOL ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

/**
 * US-HR-04: Auto-assign trainer to batch (picks lowest workload)
 */
async function autoAssignTrainer(req, res) {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
        
        // Find best trainer from pool (lowest active_batch_count)
        const bestTrainerRes = await client.query(
            `SELECT cp.trainer_id,
             (SELECT COUNT(*) FROM batches b WHERE b.trainer_id = cp.trainer_id AND b.status = 'active') as count
             FROM trainer_course_pool cp 
             JOIN batches b ON cp.course_id = b.course_id 
             WHERE b.id = $1
             ORDER BY count ASC LIMIT 1`,
            [id]
        );

        if (bestTrainerRes.rows.length === 0) {
            return res.status(404).json({ error: 'No approved trainers found in the pool for this course' });
        }

        const trainerId = bestTrainerRes.rows[0].trainer_id;
        await client.query('UPDATE batches SET trainer_id = $2 WHERE id = $1', [id, trainerId]);
        
        // US-TR-08: Notify trainer
        await notifyTrainerOfAssignment(client, id, trainerId);
        
        return res.json({ 
            message: 'Auto-assigned successfully', 
            assigned_trainer_id: trainerId 
        });
    } catch (err) {
        console.error('AUTO ASSIGN ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

/**
 * US-HR-04: Add trainer to course pool
 */
async function addToPool(req, res) {
    const { course_id, trainer_id } = req.body;
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
        await client.query(
            `INSERT INTO trainer_course_pool (course_id, trainer_id) 
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [course_id, trainer_id]
        );
        return res.json({ message: 'Trainer added to pool' });
    } catch (err) {
        console.error('ADD TO POOL ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

/**
 * US-HR-04: Remove trainer from course pool
 */
async function removeFromPool(req, res) {
    const { courseId, trainerId } = req.params;
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
        await client.query(
            `DELETE FROM trainer_course_pool WHERE course_id = $1 AND trainer_id = $2`,
            [courseId, trainerId]
        );
        return res.json({ message: 'Trainer removed from pool' });
    } catch (err) {
        console.error('REMOVE FROM POOL ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

/**
 * US-CRS-07: Get batches assigned to the current trainer
 */
async function listMyBatches(req, res) {
    const { status } = req.query; // 'active' or 'completed'
    const trainerId = req.user.user_id;
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
        
        let query = `
            SELECT b.*, c.name as course_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) as enrolled_count
            FROM batches b
            JOIN courses c ON b.course_id = c.id
            WHERE b.trainer_id = $1
        `;
        const params = [trainerId];

        if (status === 'completed') {
            query += " AND b.status = 'completed'";
        } else {
            // Default to 'active' or 'upcoming'
            query += " AND b.status IN ('active', 'upcoming')";
        }

        query += " ORDER BY b.start_date DESC";

        const result = await client.query(query, params);
        return res.json({ batches: result.rows });
    } catch (err) {
        console.error('LIST MY BATCHES ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

/**
 * Private Helper: Notify a trainer when they are assigned to a batch.
 * Triggers both in-app and email notifications.
 */
async function notifyTrainerOfAssignment(clientId, batchId, trainerId) {
    if (!trainerId) return;

    try {
        // Fetch trainer, batch and course details
        const detailsRes = await pool.query(`
            SELECT b.name as batch_name, b.start_date, b.schedule_type, b.class_days, 
                   b.class_time_start, b.class_time_end, c.name as course_name,
                   u.email as trainer_email, u.full_name as trainer_name,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id) as enrolled_count
            FROM batches b
            JOIN courses c ON b.course_id = c.id
            JOIN users u ON u.id = $2
            WHERE b.id = $1
        `, [batchId, trainerId]);

        if (detailsRes.rows.length === 0) return;

        const row = detailsRes.rows[0];
        const scheduleStr = `${row.schedule_type} (${JSON.parse(row.class_days || '[]').join(', ')} @ ${row.class_time_start}-${row.class_time_end})`;

        // 1. In-App Notification
        await createNotification(
            trainerId,
            NOTIFICATION_TYPES.BATCH_ASSIGNED,
            'New Batch Assigned',
            `You have been assigned to batch "${row.batch_name}" for "${row.course_name}". Click to view details.`,
            batchId
        );

        // 2. Email Notification
        await emailService.sendBatchAssignmentEmail({
            toEmail: row.trainer_email,
            trainerName: row.trainer_name,
            batchName: row.batch_name,
            courseName: row.course_name,
            startDate: new Date(row.start_date).toLocaleDateString(),
            schedule: scheduleStr,
            studentCount: row.enrolled_count,
            dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/trainer/batches`
        });

        console.log(`[NOTIFY] Assigned trainer ${trainerId} notified for batch ${batchId}`);
    } catch (err) {
        console.error('[NOTIFY ERROR] Failed to notify trainer:', err.message);
    }
}

module.exports = {
  createBatch, listBatches, getBatch, updateBatch,
  assignTrainer, listTrainerPool, autoAssignTrainer,
  addToPool, removeFromPool, listMyBatches
};
