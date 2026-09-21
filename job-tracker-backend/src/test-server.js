require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

console.log('DATABASE_URL=' + process.env.DATABASE_URL);
console.log('JWT_SECRET=' + process.env.JWT_SECRET);
console.log('PORT=' + process.env.PORT);

const authRoutes = require('./src/routes/auth');
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', db: process.env.DATABASE_URL }));

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => { console.log('UP:' + PORT); });

setTimeout(() => { server.close(); process.exit(0); }, 40000);
