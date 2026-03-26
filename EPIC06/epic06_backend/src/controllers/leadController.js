// ==========================================================================
// ACADENO LMS — Lead Controller
// ==========================================================================

const crypto = require('crypto');
const { pool } = require('../db/index');
const redis = require('../utils/redis');
const { parseCSV } = require('../utils/csvParser');
const { sendRegistrationInviteEmail } = require('../services/emailService');

// Invite token TTL — 7 days in seconds
const INVITE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// POST /api/leads
// ---------------------------------------------------------------------------
async function createLead(req, res) {
  const client = await pool.connect();
  
  try {
    // 1. Input Validation
    const { full_name, email, phone, course_interest, lead_source, notes } = req.body;
    
    const errors = [];
    if (!full_name) errors.push('full_name is required');
    if (!email) errors.push('email is required');
    if (!phone) errors.push('phone is required');
    if (!course_interest) errors.push('course_interest is required');
    if (!lead_source) errors.push('lead_source is required');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) errors.push('Invalid email format');

    const phoneRegex = /^\d{10}$/;
    if (phone && !phoneRegex.test(phone)) errors.push('Phone must be 10 digits');

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const bda_id = req.user.user_id;

    // Set application execution context for Postgres RLS evaluation natively
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [bda_id]);
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

    await client.query("BEGIN"); // Start transaction

    // 2. DUPLICATE CHECK (BR-L01) - Checking strictly Combination
    const dupCheck = await client.query(
      `SELECT id, full_name, email, phone, status, bda_id 
         FROM leads 
        WHERE email = $1 AND phone = $2`, 
      [email, phone]
    );

    if (dupCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: 'Duplicate lead detected',
        code: 'DUPLICATE_LEAD',
        existing_lead: dupCheck.rows[0]
      });
    }

    // 3. Create the Lead
    const insertLead = await client.query(
      `INSERT INTO leads (bda_id, full_name, email, phone, course_interest, lead_source, status, last_activity_at) 
       VALUES ($1, $2, $3, $4, $5, $6, 'new', NOW()) 
       RETURNING *`,
      [bda_id, full_name, email, phone, course_interest, lead_source]
    );

    const newLead = insertLead.rows[0];

    // 4. Handle initial history mapping
    await client.query(
      `INSERT INTO lead_status_history (lead_id, changed_by, from_status, to_status) 
       VALUES ($1, $2, NULL, 'new')`,
      [newLead.id, bda_id]
    );

    // 5. Append notes automatically if provided natively mapped asynchronously
    if (notes) {
      await client.query(
        `INSERT INTO lead_notes (lead_id, bda_id, note_text) 
         VALUES ($1, $2, $3)`,
        [newLead.id, bda_id, notes]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: 'Lead created successfully',
      lead: newLead
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error('Create Lead Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/leads/:id
// ---------------------------------------------------------------------------
async function getLeadById(req, res) {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    // Apply strict RLS locking via UUID injections mapped securely 
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

    // RLS handles the isolation logic natively, so any user lacking rights naturally hits 0 dimensions.
    const leadResult = await client.query(`SELECT * FROM leads WHERE id = $1`, [id]);

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or access denied natively via RLS context.' });
    }

    const lead = leadResult.rows[0];

    // Aggregate secondary metadata
    const historyResult = await client.query(
      `SELECT * FROM lead_status_history WHERE lead_id = $1 ORDER BY changed_at DESC`, 
      [id]
    );
    
    const notesResult = await client.query(
      `SELECT * FROM lead_notes WHERE lead_id = $1 ORDER BY created_at DESC`, 
      [id]
    );

    return res.status(200).json({
      lead: lead,
      history: historyResult.rows,
      notes: notesResult.rows
    });

  } catch (err) {
    console.error('Get Lead Error:', err.message);
    
    // Prevent unhandled Postgres UUID cast rejections natively exposing DB errors 
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid lead ID format.' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/leads/:id/status
// ---------------------------------------------------------------------------
const STATUS_ORDER = {
  'new': 0,
  'contacted': 1,
  'interested': 2,
  'negotiating': 3,
  'converted': 4,
  'registration_completed': 5,
  'onboarded': 6,
  'cold': 7
};

async function updateLeadStatus(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { new_status, reason } = req.body;

    if (!new_status || STATUS_ORDER[new_status] === undefined) {
      return res.status(400).json({ error: 'Valid new_status is required' });
    }

    // Set contextual scope for RLS checking natively
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

    await client.query("BEGIN");

    // Retrieve active target lead locked into RLS
    // (RLS completely enforces bda/super_admin isolation organically returning 0 rows if unassigned)
    const selectRes = await client.query(
      `SELECT id, status, is_locked FROM leads WHERE id = $1 FOR UPDATE`, 
      [id]
    );

    if (selectRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: 'Lead not found or unauthorized' });
    }

    const lead = selectRes.rows[0];

    // BR-L04 Lock Rule Evaluation
    if (lead.is_locked) {
      await client.query("ROLLBACK");
      return res.status(423).json({
        error: 'Lead is locked',
        code: 'LEAD_LOCKED'
      });
    }

    const currentIndex = STATUS_ORDER[lead.status];
    const newIndex = STATUS_ORDER[new_status];

    if (currentIndex === newIndex) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: 'Lead is already in that status' });
    }

    // Transition Constraints
    if (newIndex < currentIndex) {
      if (!reason || reason.trim() === '') {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: 'Reason is required for backwards transition',
          code: 'REASON_REQUIRED'
        });
      }
    }

    const shouldLock = (new_status === 'converted' || new_status === 'registration_completed' || new_status === 'onboarded');
    const leadType = (new_status === 'converted') ? 'Walk-in' : lead.lead_type;

    const updateRes = await client.query(
      `UPDATE leads 
          SET status = $1, 
              last_activity_at = NOW(), 
              is_locked = $2,
              lead_type = $3
        WHERE id = $4 
    RETURNING *`,
      [new_status, shouldLock, leadType, id]
    );

    const histRes = await client.query(
      `INSERT INTO lead_status_history (lead_id, changed_by, from_status, to_status, reason) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, req.user.user_id, lead.status, new_status, reason || null]
    );

    await client.query("COMMIT");

    // Invalidate the Dashboard cache naturally immediately following update sequence manipulations
    await redis.del(`dashboard:${req.user.user_id}`);
    
    // Sync with Redis for fast lookup (Requirement 7)
    await redis.set(`lead_status:${id}`, new_status, 'EX', 86400); // 1 day

    return res.status(200).json({
      message: 'Status updated',
      lead: updateRes.rows[0],
      history_entry: histRes.rows[0]
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error('Update Lead Status Error:', err.message);

    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid lead ID format.' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /api/leads/:id/notes
// Append-only chronological notes natively blocking modifications (US-BDA-03)
// ---------------------------------------------------------------------------
async function addNote(req, res) {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { note_text, follow_up_date } = req.body;

    if (!note_text || note_text.trim() === '') {
      return res.status(400).json({ error: 'note_text is required and cannot be empty' });
    }

    if (note_text.length > 2000) {
      return res.status(400).json({ error: 'note_text exceeds 2000 characters maximum length' });
    }

    if (follow_up_date) {
      const parsedDate = new Date(follow_up_date);
      // Strip time context to compare natively against dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (isNaN(parsedDate.getTime()) || parsedDate < today) {
         return res.status(400).json({ error: 'follow_up_date must be today or a future date' });
      }
    }

    // Lock RLS scope to user logic naturally
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

    await client.query("BEGIN");

    // Secure targeted lead locking RLS down dynamically
    const leadCheck = await client.query(
      `SELECT id FROM leads WHERE id = $1 FOR UPDATE`, 
      [id]
    );

    if (leadCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: 'Lead not found or access denied' });
    }

    // Insert Note and Join User explicitly returning the joined dataset natively using WTH mapped logic or secondary sequence
    const insertRes = await client.query(
      `INSERT INTO lead_notes (lead_id, bda_id, note_text, follow_up_date) 
       VALUES ($1, $2, $3, $4) RETURNING *`, 
      [id, req.user.user_id, note_text, follow_up_date || null]
    );

    const insertedNote = insertRes.rows[0];

    // Grab the BDA email (simulating name metadata natively mapped to the user)
    const userResult = await client.query(`SELECT email as full_name FROM users WHERE id = $1`, [req.user.user_id]);
    insertedNote.bda_name = userResult.rows[0]?.full_name || 'System';

    // Map secondary updates strictly cascading context
    if (follow_up_date) {
      await client.query(
        `UPDATE leads SET last_activity_at = NOW(), follow_up_date = $1 WHERE id = $2`, 
        [follow_up_date, id]
      );
    } else {
      await client.query(
        `UPDATE leads SET last_activity_at = NOW() WHERE id = $1`, 
        [id]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: 'Note added securely',
      note: insertedNote
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error('Add Note Error:', err.message);

    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid lead ID format.' });
    }

    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/leads/:id/notes
// Fetch strictly append-only chronologically array mapped notes securely via RLS
// ---------------------------------------------------------------------------
async function getNotes(req, res) {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

    // RLS locks evaluating lead existence securely
    const leadCheck = await client.query(`SELECT id FROM leads WHERE id = $1`, [id]);
    
    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or unauthorized' });
    }

    // Join against Users securely fetching ascending metadata naturally
    const notesResult = await client.query(
      `SELECT n.id, n.lead_id, n.bda_id, n.note_text, n.follow_up_date, n.created_at, u.email as bda_name 
         FROM lead_notes n 
         LEFT JOIN users u ON n.bda_id = u.id 
        WHERE n.lead_id = $1 
     ORDER BY n.created_at ASC`,
      [id]
    );

    return res.status(200).json({
      notes: notesResult.rows
    });

  } catch (err) {
    console.error('Get Notes Error:', err.message);
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid lead ID format.' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/leads/dashboard
// Fetch analytical configurations isolating BDA metrics securely (US-BDA-04)
// ---------------------------------------------------------------------------
async function getDashboard(req, res) {
  const client = await pool.connect();
  try {
    const cacheKey = `dashboard:${req.user.user_id}`;
    // 1. Redis Cache Implementation natively isolating logic execution (TTL=3s for now to keep it fresh)
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    // Explicitly set RLS scope natively resolving aggregate filters automatically against standard user limits 
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

    // 2. Fetch Core Baseline metrics dynamically utilizing Date filters accurately 
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // getMonth() returns 0-11 mapping

    // Fetch Total Leads exclusively natively mapping RLS automatically against creation month
    const totalLeadsRes = await client.query(
      `SELECT count(*) FROM leads 
        WHERE EXTRACT(YEAR FROM created_at) = $1 
          AND EXTRACT(MONTH FROM created_at) = $2`, 
      [currentYear, currentMonth]
    );
    const total_leads_this_month = parseInt(totalLeadsRes.rows[0].count, 10);

    // Fetch Converted Leads for metric generation automatically mapping RLS against the creation month
    const convertedLeadsRes = await client.query(
      `SELECT count(*) FROM leads 
        WHERE EXTRACT(YEAR FROM created_at) = $1 
          AND EXTRACT(MONTH FROM created_at) = $2 
          AND status = 'converted'`, 
      [currentYear, currentMonth]
    );
    const convertedThisMonth = parseInt(convertedLeadsRes.rows[0].count, 10);

    // Calculate conversion rate effectively generating safe fractions correctly checking standard division zeroes mapping
    let conversion_rate = 0;
    if (total_leads_this_month > 0) {
      conversion_rate = parseFloat(((convertedThisMonth / total_leads_this_month) * 100).toFixed(1));
    }

    // 3. Pipeline Board Status Aggregate mapped strictly 
    const pipelineGroups = await client.query(
      `SELECT status, count(*) FROM leads GROUP BY status`
    );

    const pipeline_board = {
      new: 0,
      contacted: 0,
      interested: 0,
      negotiating: 0,
      converted: 0,
      cold: 0
    };
    
    pipelineGroups.rows.forEach((row) => {
      if (pipeline_board[row.status] !== undefined) {
         pipeline_board[row.status] = parseInt(row.count, 10);
      }
    });

    // 4. Overdue Followups Isolation safely mapped natively comparing Dates isolating strict exceptions dynamically mapped
    const overdueRes = await client.query(
      `SELECT id, full_name, email, follow_up_date, status 
         FROM leads 
        WHERE follow_up_date < CURRENT_DATE 
          AND status != 'converted' 
     ORDER BY follow_up_date ASC`
    );

    const overdue_followups = overdueRes.rows.map(row => ({
      ...row,
      overdue: true
    }));

    // 5. Monthly Targets logic firmly locked to 20 temporarily via constraints
    const TARGET = 20;
    const monthly_target = {
      target: TARGET,
      achieved: convertedThisMonth,
      percentage: TARGET > 0 ? parseFloat(((convertedThisMonth / TARGET) * 100).toFixed(1)) : 0
    };

    const dashboardResponse = {
      total_leads_this_month,
      conversion_rate,
      pipeline_board,
      overdue_followups,
      monthly_target
    };

    // Update Cache synchronously maintaining explicit isolated user variables organically
    await redis.set(cacheKey, JSON.stringify(dashboardResponse), 'EX', 300);

    return res.status(200).json(dashboardResponse);

  } catch (err) {
    console.error('Get Dashboard Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/leads
// Fetch leads with dynamic search, filtration, and pagination matrices natively (US-BDA-08)
// ---------------------------------------------------------------------------
async function getLeads(req, res) {
  const client = await pool.connect();

  try {
    const { search, status, course_interest, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    let limitNum = parseInt(limit, 10) || 20;
    if (limitNum > 100) limitNum = 100;

    const offset = (pageNum - 1) * limitNum;

    // Apply native RLS isolates blocking unauthorized scopes entirely 
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

    // Build Dynamic parameterised clauses sequentially isolating payload logic securely
    const queryParams = [];
    const conditions = ["1=1"]; // base condition

    if (search) {
      queryParams.push(`%${search}%`);
      const varIndex = queryParams.length;
      conditions.push(`(full_name ILIKE $${varIndex} OR email ILIKE $${varIndex} OR phone ILIKE $${varIndex})`);
    }

    if (status && status.trim() !== '') {
      queryParams.push(status);
      conditions.push(`status = $${queryParams.length}`);
    }

    if (course_interest && course_interest.trim() !== '') {
      queryParams.push(course_interest);
      conditions.push(`course_interest = $${queryParams.length}`);
    }

    const whereClause = conditions.join(" AND ");

    // Count Total isolated accurately natively returning dimensions limited by RLS securely
    const countQuery = `SELECT count(*) FROM leads WHERE ${whereClause}`;
    const countRes = await client.query(countQuery, queryParams);
    const total_count = parseInt(countRes.rows[0].count, 10);

    // Fetch Target Data array locking sorting formats dynamically
    const dataQuery = `
      SELECT id, full_name, email, phone, course_interest, status, 
             follow_up_date, last_activity_at, is_locked, 
             (follow_up_date < CURRENT_DATE AND status != 'converted') as overdue
        FROM leads
       WHERE ${whereClause}
    ORDER BY last_activity_at DESC
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(limitNum);
    // Offset gets assigned safely natively avoiding numeric injections 
    queryParams.push(offset); 

    const leadsRes = await client.query(dataQuery, queryParams);

    return res.status(200).json({
      leads: leadsRes.rows,
      total_count,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(total_count / limitNum) || 1
    });

  } catch (err) {
    console.error('Get Leads Error:', err.message);
    if (err.code === '22P02') { // ENUM validation traps natively caught by PG engine
       return res.status(400).json({ error: 'Invalid search or status parameters' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /api/leads/:id/convert
// Transition lead to Converted state and lock it for BDA editing (US-BDA-05)
// ---------------------------------------------------------------------------
async function convertLead(req, res) {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    // Apply RLS scope natively resolving checks against bda_id or super_admin bypass
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

    await client.query("BEGIN");

    // Fetch lead with lock to prevent concurrent status shifts
    const selectRes = await client.query(
      `SELECT id, full_name, email, phone, course_interest, status, is_locked FROM leads WHERE id = $1 FOR UPDATE`, 
      [id]
    );

    if (selectRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: 'Lead not found or access denied' });
    }

    const lead = selectRes.rows[0];

    // If already converted, don't re-convert but return 409 (BR-L05)
    if (lead.status === 'converted') {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: 'Lead is already converted' });
    }

    // Pipeline Stage Validation: Must be Interested or Negotiating
    if (lead.status !== 'interested' && lead.status !== 'negotiating') {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: 'Lead must be at Interested or Negotiating stage to convert',
        code: 'INVALID_STATUS_FOR_CONVERSION'
      });
    }

    // Execute Conversion if not already converted: Status=converted, is_locked=true, lead_type=Walk-in
    let updatedLead = lead;
    if (lead.status !== 'converted') {
      const updateRes = await client.query(
        `UPDATE leads 
            SET status = 'converted', 
                is_locked = true, 
                lead_type = 'Walk-in',
                last_activity_at = NOW() 
          WHERE id = $1 
      RETURNING *`,
        [id]
      );
      updatedLead = updateRes.rows[0];

      // Audit History Entry
      await client.query(
        `INSERT INTO lead_status_history (lead_id, changed_by, from_status, to_status, reason) 
         VALUES ($1, $2, $3, 'converted', 'Lead converted to enrollment pipeline (via invite link)')`,
        [id, req.user.user_id, lead.status]
      );
      
      // Redis sync
      await redis.set(`lead_status:${id}`, 'converted', 'EX', 86400);
    }

    await client.query("COMMIT");

    // -----------------------------------------------------------------------
    // Post-commit side effects: generate invite token, store in Redis, send email.
    // Wrapped in their OWN try-catch — any Redis or email failure must NOT
    // cause a 500. The DB commit already succeeded; the lead IS converted.
    // -----------------------------------------------------------------------
    let inviteSent = false;
    try {
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const inviteData  = JSON.stringify({
        lead_id:   lead.id,
        email:     lead.email,
        lead_name: lead.full_name,
        bda_id:    req.user.user_id,
      });

      await redis.set(`reg:invite:${inviteToken}`,  inviteData,  'EX', INVITE_TOKEN_TTL_SECONDS);
      await redis.set(`reg:lead_invite:${lead.id}`, inviteToken, 'EX', INVITE_TOKEN_TTL_SECONDS);

      const wizardUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?token=${inviteToken}`;

      // Fire-and-forget — conversion is already committed
      sendRegistrationInviteEmail(lead.email, lead.full_name, wizardUrl).catch((emailErr) => {
        console.error('Failed to send registration invite email:', emailErr.message);
      });

      inviteSent = true;
    } catch (sideEffectErr) {
      // Log but never bubble up — lead conversion is complete in DB
      console.error('Post-commit side effect failed (Redis/email):', sideEffectErr.message);
    }

    return res.status(200).json({
      message: inviteSent
        ? 'Lead converted successfully. Registration invite sent to lead\'s email.'
        : 'Lead converted successfully. (Invite email could not be sent — please retry manually.)',
      registration_prefill: {
        full_name:       lead.full_name,
        email:           lead.email,
        phone:           lead.phone,
        course_interest: lead.course_interest,
      },
      lead_id:     lead.id,
      invite_sent: inviteSent,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error('Convert Lead Error:', err.message);
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid lead ID format' });
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/leads/:id/unlock
// Administrative bypass to re-open a locked/converted lead (Super Admin Only)
// ---------------------------------------------------------------------------
async function unlockLead(req, res) {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    // Super Admin check is handled at router level middleware, but we set RLS for consistency
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
    await client.query("SELECT set_config('app.current_user_role', 'super_admin', false)"); // Force elevated scope for this op

    await client.query("BEGIN");

    // Check Existence
    const leadCheck = await client.query(`SELECT id, status FROM leads WHERE id = $1 FOR UPDATE`, [id]);
    if (leadCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: 'Lead not found' });
    }

    const currentStatus = leadCheck.rows[0].status;

    // Unlock: Status back to negotiating, is_locked=false
    const updateRes = await client.query(
      `UPDATE leads 
          SET status = 'negotiating', 
              is_locked = false, 
              last_activity_at = NOW() 
        WHERE id = $1 
    RETURNING *`,
      [id]
    );

    // Audit History Entry for unlocking
    await client.query(
      `INSERT INTO lead_status_history (lead_id, changed_by, from_status, to_status, reason) 
       VALUES ($1, $2, $3, 'negotiating', 'Lead unlocked by Super Admin for re-negotiation')`,
      [id, req.user.user_id, currentStatus]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: 'Lead unlocked successfully',
      lead: updateRes.rows[0]
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error('Unlock Lead Error:', err.message);
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid lead ID format' });
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /api/leads/import
// Bulk Lead Import from CSV (US-BDA-06)
// ---------------------------------------------------------------------------
async function importLeads(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const client = await pool.connect();
  const bda_id = req.user.user_id;

  try {
    const rawRows = await parseCSV(req.file.buffer);
    
    const results = {
      imported: 0,
      skipped: [],
      errors: [],
      total_rows_processed: rawRows.length
    };

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    // Set context for RLS mapping once natively
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [bda_id]);
    await client.query("SELECT set_config('app.current_user_role', $1, false)", [req.user.role]);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10}$/;

    const validRowsToInsert = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowIdx = i + 1;

      // 1. Mandatory Fields Validation
      const name = (row.name || row.full_name || '').trim();
      const email = (row.email || '').trim();
      const phone = (row.phone || '').trim();
      const course_interest = (row.course_interest || '').trim();
      const lead_source = (row.source || row.lead_source || '').trim();

      if (!name || !email || !phone || !course_interest || !lead_source) {
        results.errors.push({ row: rowIdx, reason: 'Missing required fields' });
        continue;
      }

      // 2. Format Validation
      if (!emailRegex.test(email)) {
        results.errors.push({ row: rowIdx, email, reason: 'Invalid email format' });
        continue;
      }

      if (!phoneRegex.test(phone)) {
        results.errors.push({ row: rowIdx, phone, reason: 'Phone must be 10 digits' });
        continue;
      }

      // 3. Duplicate check (BR-L01) - Check against DB row-by-row
      const dupCheck = await client.query(
        "SELECT id FROM leads WHERE email = $1 AND phone = $2 LIMIT 1",
        [email, phone]
      );

      if (dupCheck.rows.length > 0) {
        results.skipped.push({ row: rowIdx, email, phone, reason: 'Duplicate email+phone' });
        continue;
      }

      validRowsToInsert.push({ name, email, phone, course_interest, lead_source });
    }

    // 4. Optimized Bulk INSERT (If any valid rows remain)
    if (validRowsToInsert.length > 0) {
      await client.query("BEGIN");

      // Construct bulk leads insert
      // INSERT INTO leads (bda_id, full_name, email, phone, course_interest, lead_source, status, last_activity_at)
      // VALUES ($1, $2, ...), ($9, $10, ...)
      const leadValues = [];
      const leadPlaceholders = [];
      
      validRowsToInsert.forEach((lead, index) => {
        const offset = index * 8;
        leadPlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, 'new', NOW())`);
        leadValues.push(bda_id, lead.name, lead.email, lead.phone, lead.course_interest, lead.lead_source);
      });

      const insertLeadsQuery = `
        INSERT INTO leads (bda_id, full_name, email, phone, course_interest, lead_source, status, last_activity_at)
        VALUES ${leadPlaceholders.join(', ')}
        RETURNING id
      `;

      const insertRes = await client.query(insertLeadsQuery, leadValues);
      const newLeadIds = insertRes.rows;

      // Construct bulk history insert
      const historyValues = [];
      const historyPlaceholders = [];

      newLeadIds.forEach((row, index) => {
        const offset = index * 2;
        historyPlaceholders.push(`($${offset + 1}, $${offset + 2}, NULL, 'new')`);
        historyValues.push(row.id, bda_id);
      });

      const insertHistoryQuery = `
        INSERT INTO lead_status_history (lead_id, changed_by, from_status, to_status)
        VALUES ${historyPlaceholders.join(', ')}
      `;

      await client.query(insertHistoryQuery, historyValues);

      await client.query("COMMIT");
      results.imported = validRowsToInsert.length;
    }

    return res.status(200).json(results);

  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error('Import Leads Error:', err.message);
    return res.status(500).json({ error: 'Internal server error while processing bulk import' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/leads/:id
// Delete a lead (BDA can delete their own leads, Super Admin can delete any lead)
// ---------------------------------------------------------------------------
async function deleteLead(req, res) {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    // Apply RLS scope natively resolving checks against bda_id or super_admin bypass
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

    await client.query("BEGIN");

    // Fetch lead with lock to prevent concurrent operations
    const selectRes = await client.query(
      `SELECT id, full_name, email, status, bda_id FROM leads WHERE id = $1 FOR UPDATE`, 
      [id]
    );

    if (selectRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: 'Lead not found or access denied' });
    }

    const lead = selectRes.rows[0];

    // Authorization check: BDA can only delete their own leads, Super Admin can delete any
    if (req.user.role !== 'super_admin' && lead.bda_id !== req.user.user_id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: 'Insufficient permissions to delete this lead' });
    }

    // Cannot delete leads that are converted, registration_completed, or onboarded
    if (lead.status === 'converted' || lead.status === 'registration_completed' || lead.status === 'onboarded') {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: 'Cannot delete lead with status: converted, registration_completed, or onboarded',
        code: 'STATUS_PROTECTED'
      });
    }

    // Delete related data (foreign key constraints)
    await client.query(`DELETE FROM lead_notes WHERE lead_id = $1`, [id]);
    await client.query(`DELETE FROM lead_status_history WHERE lead_id = $1`, [id]);

    // Delete the lead itself
    await client.query(`DELETE FROM leads WHERE id = $1`, [id]);

    await client.query("COMMIT");

    // Invalidate the Dashboard cache naturally immediately following deletion
    await redis.del(`dashboard:${req.user.user_id}`);
    
    // Clean up Redis cache for this lead
    await redis.del(`lead_status:${id}`);

    return res.status(200).json({
      message: 'Lead deleted successfully',
      lead_id: id,
      lead_name: lead.full_name
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error('Delete Lead Error:', err.message);
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid lead ID format' });
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = {
  createLead,
  getLeadById,
  updateLeadStatus,
  addNote,
  getNotes,
  getDashboard,
  getLeads,
  convertLead,
  unlockLead,
  importLeads,
  deleteLead
};
