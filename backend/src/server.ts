import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Confidos Pharma Server running on port ${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🏢 Multi-Branch System: Vijayawada, Guntur, Tenali`);
  console.log(`=======================================================`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please terminate the conflicting process or change PORT in .env.`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

