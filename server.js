import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 8080;
console.log(process.env.DATABASE_URL ? "📦 Using PostgreSQL store" : "💾 Using memory file store");

// Ensure data directory exists
const dataDir = '/app/data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Project Management MCP Server is running', 
    timestamp: new Date().toISOString(),
    service: 'contextmanager-project'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Project Management MCP Server',
    status: 'running',
    repository: 'kimbo128/contextmanager',
    domain: 'project',
    endpoints: {
      health: '/health',
      mcp: '/mcp'
    }
  });
});

// MCP endpoint for client connections
app.post('/mcp', express.json(), (req, res) => {
  // This endpoint can be used for HTTP-based MCP communication
  res.json({
    message: 'MCP Server endpoint',
    note: 'Use stdio connection for full MCP protocol'
  });
});

// Start the MCP Server as a subprocess (updated path for TypeScript build)
const mcpServer = spawn('node', ['dist/main/index.js', '--domains', 'project'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH || '/app/data/project-memory.json',
    SESSIONS_FILE_PATH: process.env.SESSIONS_FILE_PATH || '/app/data/project-sessions.json'
  }
});

mcpServer.stdout.on('data', (data) => {
  console.log(`[MCP Server]: ${data.toString().trim()}`);
});

mcpServer.stderr.on('data', (data) => {
  console.error(`[MCP Server Error]: ${data.toString().trim()}`);
});

mcpServer.on('close', (code) => {
  console.log(`MCP Server process exited with code ${code}`);
  if (code !== 0) {
    console.log('Restarting MCP Server...');
    // You could implement restart logic here
  }
});

// Start HTTP server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Railway HTTP Server running on port ${PORT}`);
  console.log(`🧠 Project Management MCP Server started`);
  console.log(`📊 Data directory: ${dataDir}`);
  console.log(`💾 Memory file: ${process.env.MEMORY_FILE_PATH}`);
  console.log(`📝 Sessions file: ${process.env.SESSIONS_FILE_PATH}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  mcpServer.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  mcpServer.kill('SIGINT');
  process.exit(0);
});
