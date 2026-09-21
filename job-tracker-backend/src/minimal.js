require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log('UP:' + PORT);
  console.log('DB=' + process.env.DATABASE_URL);
  console.log('JWT=' + (process.env.JWT_SECRET ? 'set' : 'unset'));
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
