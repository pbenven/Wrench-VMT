//Wrench — Vehicle Maintenance Tracker
//Copyright (C) 2025 Paolo Benvenuti

//This program is free software: you can redistribute it and/or modify
//it under the terms of the GNU General Public License as published by
//the Free Software Foundation, either version 3 of the License, or
//(at your option) any later version.

//This program is distributed in the hope that it will be useful,
//but WITHOUT ANY WARRANTY; without even the implied warranty of
//MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
//GNU General Public License for more details.

//You should have received a copy of the GNU General Public License
//along with this program. If not, see https://www.gnu.org/licenses/.


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
      SELECT wml.task_id, ms.task_description, ms.notes
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

// Update garage
app.put('/garages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address1, address2, contact } = req.body;
    const result = await pool.query(
      `UPDATE garage SET name=$1, address1=$2, address2=$3, contact=$4
       WHERE garage_id=$5 RETURNING *`,
      [name, address1, address2, contact, id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Garage not found' });
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

// Update vehicle
app.put('/vehicles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { make, model, year, vin, purchase_date } = req.body;
    const result = await pool.query(
      `UPDATE vehicles SET make=$1, model=$2, year=$3, vin=$4, purchase_date=$5
       WHERE vehicle_id=$6 RETURNING *`,
      [make, model, year, vin, purchase_date, id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Vehicle not found' });
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

// Get schedule with calculated due values for a vehicle
app.get('/schedule/status', async (req, res) => {
  try {
    const { vehicle_id, odo, date } = req.query;

    if (!vehicle_id || !odo || !date) {
      return res.status(400).json({ error: 'vehicle_id, odo, and date are required' });
    }

    const vehicleId = parseIntParam(vehicle_id, 'vehicle_id');

    const result = await pool.query(`
      SELECT
        ms.task_id,
        ms.task_description,
        ms.odo_interval,
        ms.time_interval,
        ms.is_one_time,
        ms.notes,
        v.calculated_next_due_odo,
        v.calculated_next_due_date
      FROM maintenance_schedule ms
      JOIN vw_tasks_due v ON v.task_id = ms.task_id
      WHERE ms.vehicle_id = $1
      ORDER BY ms.task_id
    `, [vehicleId]);

    res.json(result.rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update schedule task
app.put('/schedule/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { task_description, odo_interval, time_interval, notes, is_one_time } = req.body;
    const result = await pool.query(
      `UPDATE maintenance_schedule
       SET task_description=$1, odo_interval=$2, time_interval=$3,
           notes=$4, is_one_time=$5
       WHERE task_id=$6 RETURNING *`,
      [task_description, odo_interval || null, time_interval || null,
       notes, is_one_time || false, id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete schedule task
app.delete('/schedule/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'DELETE FROM maintenance_schedule WHERE task_id=$1', [id]
    );
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ---------- PRINT ROUTES ---------- */

// Shared: fetch full work order data for print
async function getWorkOrderPrintData(pool, orderId) {
  const header = await pool.query(`
    SELECT
      woh.order_id, woh.order_date, woh.odo_reading, woh.notes,
      woh.total_cost, woh.completed,
      v.make, v.model, v.year, v.vin,
      g.name AS garage_name, g.address1, g.address2, g.contact
    FROM workorder_header woh
    JOIN vehicles v ON woh.vehicle_id = v.vehicle_id
    JOIN garage g   ON woh.garage_id  = g.garage_id
    WHERE woh.order_id = $1
  `, [orderId]);

  const tasks = await pool.query(`
    SELECT ms.task_description, ms.notes
    FROM workorder_maintenance_list wml
    JOIN maintenance_schedule ms ON wml.task_id = ms.task_id
    WHERE wml.order_id = $1
    ORDER BY ms.task_id
  `, [orderId]);

  const costs = await pool.query(`
    SELECT description, cost, cost_type
    FROM workorder_costs
    WHERE order_id = $1
    ORDER BY workorder_costs_id
  `, [orderId]);

  return {
    header: header.rows[0],
    tasks:  tasks.rows,
    costs:  costs.rows
  };
}

function printStyles() {
  return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Barlow', sans-serif;
        font-size: 13px;
        color: #1a1a1a;
        background: #fff;
        padding: 2cm;
        max-width: 21cm;
        margin: 0 auto;
      }
      h1, h2, h3 {
        font-family: 'Barlow Condensed', sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      h1 { font-size: 1.8rem; color: #c06010; border-bottom: 3px solid #c06010; padding-bottom: 0.3rem; margin-bottom: 1rem; }
      h2 { font-size: 1.2rem; color: #333; margin: 1.2rem 0 0.4rem; border-bottom: 1px solid #ccc; padding-bottom: 0.2rem; }
      h3 { font-size: 1rem; color: #555; margin: 0.8rem 0 0.3rem; }
      .meta-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.3rem 2rem;
        margin-bottom: 0.8rem;
      }
      .meta-row { display: flex; gap: 0.5rem; font-size: 0.85rem; }
      .meta-label {
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-size: 0.72rem;
        color: #777;
        min-width: 90px;
        padding-top: 0.1rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 0.5rem;
        font-size: 0.88rem;
      }
      th {
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: #777;
        border-bottom: 2px solid #ccc;
        padding: 0.3rem 0.5rem;
        text-align: left;
      }
      td { padding: 0.3rem 0.5rem; border-bottom: 1px solid #eee; }
      tr:last-child td { border-bottom: none; }
      .total-row td { font-weight: 700; border-top: 2px solid #ccc; padding-top: 0.4rem; }
      .badge {
        display: inline-block;
        font-size: 0.65rem;
        font-family: 'Barlow Condensed', sans-serif;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        background: #f0e0d0;
        color: #a04010;
        border-radius: 3px;
        padding: 0.1rem 0.35rem;
      }
      .status-open   { background: #fff3cd; color: #856404; }
      .status-closed { background: #d1e7dd; color: #0f5132; }
      .order-block { border: 1px solid #ddd; border-radius: 4px; padding: 0.8rem 1rem; margin-bottom: 1rem; page-break-inside: avoid; }
      .order-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }
      .order-title { font-family: 'Barlow Condensed', sans-serif; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.04em; }
      .no-print { margin-bottom: 1rem; }
      .print-btn {
        background: #c06010;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 0.5rem 1.2rem;
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 0.9rem;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .print-btn:hover { background: #a04010; }
      .empty { color: #999; font-style: italic; }
      @media print {
        .no-print { display: none !important; }
        body { padding: 0; }
      }
    </style>
  `;
}

function renderWorkOrderBlock(order, tasks, costs, showStatus = false) {
  const statusBadge = showStatus
    ? `<span class="badge ${order.completed ? 'status-closed' : 'status-open'}">${order.completed ? 'Completed' : 'Open'}</span>`
    : '';

  const taskRows = tasks.length
    ? tasks.map(t => `<tr>
        <td>
          ${t.task_description}
          ${t.notes ? `<div style="font-size:0.8rem; color:#666; margin-top:0.2rem;">${t.notes.replace(/\\n/g, '<br>')}</div>` : ''}
        </td>
      </tr>`).join('')
    : `<tr><td class="empty">No scheduled tasks</td></tr>`;

  const costRows = costs.length
    ? costs.map(c => `<tr><td><span class="badge">${c.cost_type}</span> ${c.description}</td><td style="text-align:right;">$${parseFloat(c.cost).toFixed(2)}</td></tr>`).join('')
    : `<tr><td class="empty" colspan="2">No cost items</td></tr>`;

  const total = costs.reduce((s, c) => s + parseFloat(c.cost), 0);
  const totalRow = costs.length
    ? `<tr class="total-row"><td><strong>Total</strong></td><td style="text-align:right;"><strong>$${total.toFixed(2)}</strong></td></tr>`
    : '';

  return `
    <div class="order-block">
      <div class="order-header">
        <span class="order-title">Work Order #${order.order_id}</span>
        ${statusBadge}
      </div>
      <div class="meta-grid">
        <div class="meta-row"><span class="meta-label">Date</span>${order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}</div>
        <div class="meta-row"><span class="meta-label">Odometer</span>${order.odo_reading ? parseInt(order.odo_reading).toLocaleString() : '-'}</div>
        <div class="meta-row"><span class="meta-label">Garage</span>${order.garage_name || '-'}</div>
        <div class="meta-row"><span class="meta-label">Contact</span>${order.contact || '-'}</div>
        ${order.notes ? `<div class="meta-row" style="grid-column:1/-1;"><span class="meta-label">Notes</span>${order.notes}</div>` : ''}
      </div>

      <h3>Scheduled Tasks</h3>
      <table><tbody>${taskRows}</tbody></table>

      <h3>Costs</h3>
      <table>
        <thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>${costRows}${totalRow}</tbody>
      </table>
    </div>
  `;
}

// Print: single work order
app.get('/print/work-order/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { header, tasks, costs } = await getWorkOrderPrintData(pool, id);

    if (!header) return res.status(404).send('<p>Work order not found.</p>');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Work Order #${header.order_id}</title>
      ${printStyles()}
    </head><body>
      <div class="no-print">
        <button class="print-btn" onclick="window.print()">&#x1F5A8; Print</button>
      </div>
      <h1>Work Order #${header.order_id}</h1>
      <div class="meta-grid" style="margin-bottom:1rem;">
        <div class="meta-row"><span class="meta-label">Vehicle</span>${header.year || ''} ${header.make} ${header.model}</div>
        <div class="meta-row"><span class="meta-label">VIN</span>${header.vin || '-'}</div>
        <div class="meta-row"><span class="meta-label">Status</span>
          <span class="badge ${header.completed ? 'status-closed' : 'status-open'}">${header.completed ? 'Completed' : 'Open'}</span>
        </div>
      </div>
      ${renderWorkOrderBlock(header, tasks, costs)}
    </body></html>`;

    res.send(html);
  } catch (err) {
    res.status(500).send(`<p>Error: ${err.message}</p>`);
  }
});

// Print: vehicle history - full detail (closed orders)
app.get('/print/vehicle/:id/history', async (req, res) => {
  try {
    const { id } = req.params;

    const vehicle = await pool.query(
      'SELECT * FROM vehicles WHERE vehicle_id=$1', [id]
    );
    if (!vehicle.rows.length) return res.status(404).send('<p>Vehicle not found.</p>');
    const v = vehicle.rows[0];

    const orders = await pool.query(`
      SELECT order_id FROM workorder_header
      WHERE vehicle_id=$1 AND completed=true
      ORDER BY order_date ASC, order_id ASC
    `, [id]);

    const blocks = [];
    for (const o of orders.rows) {
      const { header, tasks, costs } = await getWorkOrderPrintData(pool, o.order_id);
      blocks.push(renderWorkOrderBlock(header, tasks, costs));
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Vehicle History — ${v.year || ''} ${v.make} ${v.model}</title>
      ${printStyles()}
    </head><body>
      <div class="no-print">
        <button class="print-btn" onclick="window.print()">&#x1F5A8; Print</button>
      </div>
      <h1>Maintenance History</h1>
      <div class="meta-grid" style="margin-bottom:1rem;">
        <div class="meta-row"><span class="meta-label">Vehicle</span>${v.year || ''} ${v.make} ${v.model}</div>
        <div class="meta-row"><span class="meta-label">VIN</span>${v.vin || '-'}</div>
      </div>
      ${blocks.length ? blocks.join('') : '<p class="empty">No completed work orders found.</p>'}
    </body></html>`;

    res.send(html);
  } catch (err) {
    res.status(500).send(`<p>Error: ${err.message}</p>`);
  }
});

// Print: vehicle history - summary (closed orders)
app.get('/print/vehicle/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;

    const vehicle = await pool.query(
      'SELECT * FROM vehicles WHERE vehicle_id=$1', [id]
    );
    if (!vehicle.rows.length) return res.status(404).send('<p>Vehicle not found.</p>');
    const v = vehicle.rows[0];

    const orders = await pool.query(`
      SELECT
        woh.order_id, woh.order_date, woh.odo_reading, woh.total_cost,
        g.name AS garage_name,
        COUNT(wml.task_id) AS task_count
      FROM workorder_header woh
      JOIN garage g ON woh.garage_id = g.garage_id
      LEFT JOIN workorder_maintenance_list wml ON wml.order_id = woh.order_id
      WHERE woh.vehicle_id=$1 AND woh.completed=true
      GROUP BY woh.order_id, woh.order_date, woh.odo_reading, woh.total_cost, g.name
      ORDER BY woh.order_date ASC, woh.order_id ASC
    `, [id]);

    const rows = orders.rows.map(o => `
      <tr>
        <td>#${o.order_id}</td>
        <td>${o.order_date ? new Date(o.order_date).toLocaleDateString() : '-'}</td>
        <td>${o.odo_reading ? parseInt(o.odo_reading).toLocaleString() : '-'}</td>
        <td>${o.garage_name || '-'}</td>
        <td style="text-align:center;">${o.task_count}</td>
        <td style="text-align:right;">$${o.total_cost ? parseFloat(o.total_cost).toFixed(2) : '0.00'}</td>
      </tr>
    `).join('');

    const grandTotal = orders.rows.reduce((s, o) => s + parseFloat(o.total_cost || 0), 0);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Work Order Summary — ${v.year || ''} ${v.make} ${v.model}</title>
      ${printStyles()}
    </head><body>
      <div class="no-print">
        <button class="print-btn" onclick="window.print()">&#x1F5A8; Print</button>
      </div>
      <h1>Work Order Summary</h1>
      <div class="meta-grid" style="margin-bottom:1rem;">
        <div class="meta-row"><span class="meta-label">Vehicle</span>${v.year || ''} ${v.make} ${v.model}</div>
        <div class="meta-row"><span class="meta-label">VIN</span>${v.vin || '-'}</div>
      </div>
      ${orders.rows.length ? `
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Date</th>
            <th>Odometer</th>
            <th>Garage</th>
            <th style="text-align:center;">Tasks</th>
            <th style="text-align:right;">Total Cost</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="5"><strong>Grand Total</strong></td>
            <td style="text-align:right;"><strong>$${grandTotal.toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
      ` : '<p class="empty">No completed work orders found.</p>'}
    </body></html>`;

    res.send(html);
  } catch (err) {
    res.status(500).send(`<p>Error: ${err.message}</p>`);
  }
});

/* ---------- START ---------- */

app.listen(3000, () => {
  console.log('API running on http://localhost:3000');
});
