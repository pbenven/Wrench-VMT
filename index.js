const cors = require('cors');
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  user:     process.env.PGUSER     || 'postgres',
  host:     process.env.PGHOST     || 'localhost',
  database: process.env.PGDATABASE || 'vehicle_maintenance_db',
  password: process.env.PGPASSWORD || 'postgres',
  port:     parseInt(process.env.PGPORT || '5432'),
});

/* ---------- UTIL ---------- */

// FIX #7: Reusable integer parser/validator for query params
function parseIntParam(val, name) {
  const n = parseInt(val, 10);
  if (isNaN(n)) throw new Error(`Invalid ${name}: must be an integer`);
  return n;
}

/* ---------- HEALTH ---------- */

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- WORK ORDERS ---------- */

app.get('/work-orders/open', async (req, res) => {
  // FIX #6: try/catch on all routes
  try {
    const result = await pool.query(`
      SELECT woh.order_id, v.make, v.model, woh.order_date
      FROM workorder_header woh
      JOIN vehicles v ON woh.vehicle_id = v.vehicle_id
      WHERE woh.completed = false
      ORDER BY woh.order_id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/work-orders/:id', async (req, res) => {
  // FIX #6: try/catch on all routes
  try {
    const { id } = req.params;

    const header = await pool.query(`
      SELECT
        order_id,
        vehicle_id,
        garage_id,
        order_date,
        odo_reading AS odo
      FROM workorder_header
      WHERE order_id = $1
    `, [id]);

    const tasks = await pool.query(`
      SELECT wml.task_id, ms.task_description
      FROM workorder_maintenance_list wml
      JOIN maintenance_schedule ms ON wml.task_id = ms.task_id
      WHERE wml.order_id = $1
    `, [id]);

    res.json({
      header: header.rows[0],
      tasks: tasks.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview due tasks
app.get('/vehicles/:id/tasks/preview', async (req, res) => {
  const { id } = req.params;
  const { odo, date, odo_buffer = 0, days_buffer = 0 } = req.query;

  if (!odo || !date) {
    return res.status(400).json({ error: 'Missing odo or date' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM preview_due_tasks($1, $2, $3, $4, $5)`,
      [id, odo, date, odo_buffer, days_buffer]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create work order
app.post('/work-orders', async (req, res) => {
  const {
    vehicle_id,
    garage_id,
    odo,
    date,
    task_ids,
    notes,
    strict_mode = false
  } = req.body;

  try {
    const result = await pool.query(
      `SELECT * FROM create_work_order_from_selection($1,$2,$3,$4,$5,$6,$7)`,
      [vehicle_id, garage_id, odo, date, task_ids, notes, strict_mode]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Complete work order
app.post('/work-orders/:id/complete', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `SELECT complete_work_order($1)`,
      [id]
    );
    // FIX #8: Explicit success response (client checks res.ok)
    res.json({ message: 'Work order completed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ---------- WORK ORDER COSTS ---------- */

app.get('/work-orders/:id/costs', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT workorder_costs_id, description, cost, cost_type
       FROM workorder_costs
       WHERE order_id = $1
       ORDER BY workorder_costs_id`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/work-orders/:id/costs', async (req, res) => {
  try {
    const { id } = req.params;
    const { description, cost, cost_type } = req.body;

    if (!description || cost === undefined || cost === null) {
      return res.status(400).json({ error: 'description and cost are required' });
    }

    const result = await pool.query(
      `INSERT INTO workorder_costs (order_id, description, cost, cost_type)
       VALUES ($1, $2, $3, $4)
       RETURNING workorder_costs_id, description, cost, cost_type`,
      [id, description, parseFloat(cost), cost_type || 'OTHER']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/work-orders/:id/costs/:costId', async (req, res) => {
  try {
    const { id, costId } = req.params;
    await pool.query(
      `DELETE FROM workorder_costs
       WHERE workorder_costs_id = $1 AND order_id = $2`,
      [costId, id]
    );
    res.json({ message: 'Cost item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- GARAGES ---------- */

app.get('/garages', async (req, res) => {
  // FIX #6: try/catch on all routes
  try {
    const result = await pool.query('SELECT * FROM garage ORDER BY garage_id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/garages', async (req, res) => {
  // FIX #6: try/catch on all routes
  try {
    const { name, address1, address2, contact } = req.body;

    const result = await pool.query(
      `INSERT INTO garage (name, address1, address2, contact)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [name, address1, address2, contact]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- VEHICLES ---------- */

app.get('/vehicles', async (req, res) => {
  // FIX #6: try/catch on all routes
  try {
    const result = await pool.query(
      'SELECT * FROM vehicles ORDER BY vehicle_id'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/vehicles', async (req, res) => {
  // FIX #6: try/catch on all routes
  try {
    const { make, model, year, vin, purchase_date } = req.body;

    const result = await pool.query(
      `INSERT INTO vehicles (make, model, year, vin, purchase_date)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [make, model, year, vin, purchase_date]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- SCHEDULE ---------- */

app.get('/schedule', async (req, res) => {
  // FIX #6: try/catch on all routes
  // FIX #7: Validate and cast vehicle_id to integer
  try {
    let query = `
      SELECT ms.*, v.make, v.model
      FROM maintenance_schedule ms
      JOIN vehicles v ON ms.vehicle_id = v.vehicle_id
    `;

    const params = [];

    if (req.query.vehicle_id) {
      const vehicleId = parseIntParam(req.query.vehicle_id, 'vehicle_id');
      query += ` WHERE ms.vehicle_id = $1`;
      params.push(vehicleId);
    }

    query += ` ORDER BY ms.task_id`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/schedule', async (req, res) => {
  // FIX #6: try/catch on all routes
  try {
    const {
      vehicle_id,
      task_description,
      odo_interval,
      time_interval,
      notes,
      is_one_time = false
    } = req.body;

    const result = await pool.query(
      `INSERT INTO maintenance_schedule
       (vehicle_id, task_description, odo_interval, time_interval, notes, is_one_time)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [vehicle_id, task_description, odo_interval, time_interval, notes, is_one_time]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- START ---------- */

app.listen(3000, () => {
  console.log('API running on http://localhost:3000');
});
