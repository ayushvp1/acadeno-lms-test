// ==========================================================================
// ACADENO LMS — Batch Controller (EPIC-08 Modular)
// Handles: Batch CRUD, Trainer Assignment, Trainer Course Pool
// ==========================================================================

const { pool } = require('../../../db/index');
const { sendEnrollmentSuccessEmail } = require('../../../services/emailService');

async function setRlsContext(client, role) {
  await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [role]);
}

// US-HR-01: Batch CRUD
async function createBatch(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);
    await client.query('BEGIN');
    const { course_id, batch_name, batch_code, start_date, end_date, capacity, schedule_type, class_days, class_time_start, class_time_end, meeting_url } = req.body;
    if (!course_id || !batch_name || !start_date || !capacity) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Validation failed' }); }
    if (new Date(start_date) < new Date()) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'start_date cannot be in the past' }); }
    if (batch_code) {
      const dupCheck = await client.query('SELECT id FROM batches WHERE batch_code = $1', [batch_code]);
      if (dupCheck.rows.length > 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Batch code already exists' }); }
    }
    const result = await client.query(
      `INSERT INTO batches (course_id, batch_name, batch_code, start_date, end_date, capacity, schedule_type, class_days, class_time_start, class_time_end, meeting_url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'upcoming') RETURNING *`,
      [course_id, batch_name, batch_code || null, start_date, end_date || null, capacity, schedule_type || null, JSON.stringify(class_days || []), class_time_start || null, class_time_end || null, meeting_url || null]
    );
    await client.query('COMMIT');
    return res.status(201).json({ batch: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK'); console.error('CREATE BATCH ERROR:', err.message); return res.status(500).json({ error: 'Internal server error' });
  } finally { client.release(); }
}

async function listBatches(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);
    const { course_id, status } = req.query;
    const conditions = ["b.status != 'cancelled'"];
    const params = [];
    if (course_id) { params.push(course_id); conditions.push(`b.course_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`b.status = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await client.query(
      `SELECT b.*, c.course_name, u.full_name AS trainer_name, COUNT(e.id)::int AS enrolled_count
         FROM batches b JOIN courses c ON c.id = b.course_id LEFT JOIN users u ON u.id = b.trainer_id LEFT JOIN enrollments e ON e.batch_id = b.id
         ${where} GROUP BY b.id, c.course_name, u.full_name ORDER BY b.start_date DESC`, params
    );
    return res.status(200).json({ batches: result.rows });
  } catch (err) { console.error('LIST BATCHES ERROR:', err.message); return res.status(500).json({ error: 'Internal server error' }); }
  finally { client.release(); }
}

async function getBatch(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);
    const result = await client.query(
      `SELECT b.*, c.course_name, u.full_name AS trainer_name, COUNT(e.id)::int AS enrolled_count
         FROM batches b JOIN courses c ON c.id = b.course_id LEFT JOIN users u ON u.id = b.trainer_id LEFT JOIN enrollments e ON e.batch_id = b.id
        WHERE b.id = $1 GROUP BY b.id, c.course_name, u.full_name`, [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Batch not found' });
    return res.status(200).json({ batch: result.rows[0] });
  } catch (err) { console.error('GET BATCH ERROR:', err.message); return res.status(500).json({ error: 'Internal server error' }); }
  finally { client.release(); }
}

async function updateBatch(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);
    await client.query('BEGIN');
    const batchResult = await client.query('SELECT * FROM batches WHERE id = $1', [req.params.id]);
    if (batchResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Batch not found' }); }
    const batch = batchResult.rows[0];
    if (req.body.course_id && req.body.course_id !== batch.course_id) {
      const enrollCheck = await client.query('SELECT id FROM enrollments WHERE batch_id = $1 LIMIT 1', [req.params.id]);
      if (enrollCheck.rows.length > 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cannot change course_id: enrollments exist' }); }
    }
    const allowedFields = ['batch_name', 'batch_code', 'start_date', 'end_date', 'capacity', 'schedule_type', 'class_days', 'class_time_start', 'class_time_end', 'meeting_url', 'status', 'course_id'];
    const setClauses = []; const values = [];
    allowedFields.forEach((field) => { if (req.body[field] !== undefined) { values.push(field === 'class_days' ? JSON.stringify(req.body[field]) : req.body[field]); setClauses.push(`${field} = $${values.length}`); } });
    if (setClauses.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No fields' }); }
    values.push(req.params.id);
    const updated = await client.query(`UPDATE batches SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
    await client.query('COMMIT');
    return res.status(200).json({ batch: updated.rows[0] });
  } catch (err) { await client.query('ROLLBACK'); console.error('UPDATE ERROR:', err.message); return res.status(500).json({ error: 'Internal error' }); }
  finally { client.release(); }
}

// US-HR-02: Trainer Assignment
async function assignTrainer(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);
    await client.query('BEGIN');
    const { trainer_id } = req.body;
    const batchRes = await client.query('SELECT b.*, c.course_name FROM batches b JOIN courses c ON c.id = b.course_id WHERE b.id = $1', [req.params.id]);
    if (batchRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Batch not found' }); }
    const batch = batchRes.rows[0];
    const poolCheck = await client.query('SELECT id FROM trainer_course_pool WHERE course_id = $1 AND trainer_id = $2', [batch.course_id, trainer_id]);
    if (poolCheck.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Trainer not in pool' }); }
    const trainerRes = await client.query('SELECT full_name, email FROM users WHERE id = $1', [trainer_id]);
    const trainer = trainerRes.rows[0];
    const updated = await client.query('UPDATE batches SET trainer_id = $1 WHERE id = $2 RETURNING *', [trainer_id, req.params.id]);
    await client.query('COMMIT');
    setImmediate(async () => { try { await sendEnrollmentSuccessEmail(trainer.email, trainer.full_name, batch.course_name, process.env.FRONTEND_URL || 'http://localhost:5173', null); } catch (e) { console.error('Email error', e); } });
    return res.status(200).json({ batch: updated.rows[0] });
  } catch (err) { await client.query('ROLLBACK'); console.error('ASSIGN ERROR', err.message); return res.status(500).json({ error: 'Internal error' }); }
  finally { client.release(); }
}

async function autoAssignTrainer(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role); await client.query('BEGIN');
    const batchRes = await client.query('SELECT b.*, c.course_name FROM batches b JOIN courses c ON c.id = b.course_id WHERE b.id = $1', [req.params.id]);
    const batch = batchRes.rows[0];
    const candidateRes = await client.query(`SELECT tcp.trainer_id, u.full_name, u.email, COUNT(b2.id) FILTER (WHERE b2.status = 'active') AS active_batch_count FROM trainer_course_pool tcp JOIN users u ON u.id = tcp.trainer_id LEFT JOIN batches b2 ON b2.trainer_id = tcp.trainer_id WHERE tcp.course_id = $1 GROUP BY tcp.trainer_id, u.full_name, u.email ORDER BY active_batch_count ASC LIMIT 1`, [batch.course_id]);
    if (candidateRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No trainers' }); }
    const trainer = candidateRes.rows[0];
    const updated = await client.query('UPDATE batches SET trainer_id = $1 WHERE id = $2 RETURNING *', [trainer.trainer_id, req.params.id]);
    await client.query('COMMIT');
    setImmediate(async () => { try { await sendEnrollmentSuccessEmail(trainer.email, trainer.full_name, batch.course_name, process.env.FRONTEND_URL || 'http://localhost:5173', null); } catch (e) { console.error('Email error', e); } });
    return res.status(200).json({ batch: updated.rows[0], trainer: { trainer_id: trainer.trainer_id, full_name: trainer.full_name } });
  } catch (err) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'Internal error' }); }
  finally { client.release(); }
}

async function listTrainerPool(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);
    const result = await client.query(`SELECT tcp.id, tcp.trainer_id, u.full_name, u.email, tcp.added_at, COUNT(b.id) FILTER (WHERE b.status = 'active') AS active_batch_count FROM trainer_course_pool tcp JOIN users u ON u.id = tcp.trainer_id LEFT JOIN batches b ON b.trainer_id = tcp.trainer_id AND b.course_id = tcp.course_id WHERE tcp.course_id = $1 GROUP BY tcp.id, tcp.trainer_id, u.full_name, u.email, tcp.added_at ORDER BY u.full_name`, [req.params.courseId]);
    return res.status(200).json({ trainers: result.rows });
  } catch (err) { console.error('POOL ERROR', err.message); return res.status(500).json({ error: 'Internal error' }); }
  finally { client.release(); }
}

async function addTrainerToPool(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role); await client.query('BEGIN');
    const { trainer_id } = req.body;
    const result = await client.query(`INSERT INTO trainer_course_pool (course_id, trainer_id, added_by) VALUES ($1, $2, $3) RETURNING *`, [req.params.courseId, trainer_id, req.user.user_id]);
    await client.query('COMMIT'); return res.status(201).json({ pool_entry: result.rows[0] });
  } catch (err) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'Internal error' }); }
  finally { client.release(); }
}

async function removeTrainerFromPool(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role); await client.query('BEGIN');
    const activeCheck = await client.query(`SELECT id FROM batches WHERE course_id = $1 AND trainer_id = $2 AND status = 'active' LIMIT 1`, [req.params.courseId, req.params.trainerId]);
    if (activeCheck.rows.length > 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Trainer has active batch' }); }
    const result = await client.query('DELETE FROM trainer_course_pool WHERE course_id = $1 AND trainer_id = $2 RETURNING id', [req.params.courseId, req.params.trainerId]);
    await client.query('COMMIT'); return res.status(200).json({ message: 'Success' });
  } catch (err) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'Internal error' }); }
  finally { client.release(); }
}

module.exports = { createBatch, listBatches, getBatch, updateBatch, assignTrainer, autoAssignTrainer, listTrainerPool, addTrainerToPool, removeTrainerFromPool };
