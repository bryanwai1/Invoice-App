require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Inject socket.io into whatsapp module
const wa = require('./whatsapp');
wa.setIO(io);

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
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
io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);
  // Send current WhatsApp status on connect
  socket.emit('wa:status', wa.getStatus());
  socket.on('disconnect', () => console.log('[Socket] Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 Invoice App Backend running on http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/invoices`);
  console.log(`⚙️  Settings: http://localhost:${PORT}/api/settings`);
  console.log(`📱 WhatsApp: http://localhost:${PORT}/api/whatsapp/status\n`);
});
