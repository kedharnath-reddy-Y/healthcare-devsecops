'use strict';
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const client = require('prom-client');

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USER || !ADMIN_PASSWORD) {
  console.error('ADMIN_USER and ADMIN_PASSWORD must be set');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});
app.use(express.json({ limit: '10kb' }));

client.collectDefaultMetrics();
const failedLogins = new client.Counter({ name: 'failed_logins_total', help: 'Failed login attempts' });
const unauthorized = new client.Counter({ name: 'unauthorized_requests_total', help: 'Requests without a valid token' });

const sessions = new Set();
const patients = new Map();

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!sessions.has(token)) {
    unauthorized.inc();
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const valid = typeof username === 'string' && typeof password === 'string'
    && safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASSWORD);
  if (!valid) {
    failedLogins.inc();
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.add(token);
  res.json({ token });
});

app.post('/patients', requireAuth, (req, res) => {
  const { name, dob, diagnosis } = req.body || {};
  if (typeof name !== 'string' || !/^[A-Za-z .'-]{2,60}$/.test(name)) {
    return res.status(400).json({ error: 'invalid name' });
  }
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return res.status(400).json({ error: 'invalid dob' });
  }
  if (typeof diagnosis !== 'string' || diagnosis.length > 200) {
    return res.status(400).json({ error: 'invalid diagnosis' });
  }
  const id = crypto.randomUUID();
  patients.set(id, { id, name, dob, diagnosis });
  res.status(201).json({ id });
});

app.get('/patients/:id', requireAuth, (req, res) => {
  const patient = patients.get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'not found' });
  res.json(patient);
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});

app.use((req, res) => res.status(404).json({ error: 'not found' }));

app.use((err, req, res, next) => {
  res.status(400).json({ error: 'bad request' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`listening on ${port}`));
