require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Allow any origin — FRONTEND_URL from Render's fromService gives just hostname (no protocol)
const allowedOrigin = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, `https://${process.env.FRONTEND_URL}`, `http://${process.env.FRONTEND_URL}`]
  : true; // true = reflect request origin (allows all in dev)

const io = new Server(server, {
  cors: { origin: allowedOrigin, methods: ['GET', 'POST'], credentials: true }
});

// Inject socket.io into whatsapp module
const wa = require('./whatsapp');
wa.setIO(io);

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve PDFs statically
app.use('/pdfs', express.static(path.join(__dirname, '..', 'pdfs')));

// Routes
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/whatsapp', require('./routes/whatsapp'));

// Health check
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Socket.IO
io.on('connection', async (socket) => {
  console.log('[Socket] Client connected:', socket.id);
  // Send current WhatsApp status on connect
  const status = await wa.getStatus();
  socket.emit('wa:status', status);
  socket.on('disconnect', () => console.log('[Socket] Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 Invoice App Backend running on http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/invoices`);
  console.log(`⚙️  Settings: http://localhost:${PORT}/api/settings`);
  console.log(`📱 WhatsApp: http://localhost:${PORT}/api/whatsapp/status\n`);
});
