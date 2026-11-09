/**
 * Web server: serves the game page and runs the real-time rooms.
 * Start it with:  npm start     (then open http://localhost:3000)
 */
'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { attachRooms } = require('./rooms');

function startServer(port = process.env.PORT || 3000) {
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/health', (req, res) => res.send('ok')); // used by the free host to check we're alive

  const server = http.createServer(app);
  const io = new Server(server);
  const rooms = attachRooms(io);

  return new Promise((resolve) => {
    server.listen(port, () => {
      const actualPort = server.address().port;
      resolve({
        port: actualPort,
        rooms,
        close: () =>
          new Promise((done) => {
            rooms.stop();
            io.close();
            server.close(() => done());
          }),
      });
    });
  });
}

if (require.main === module) {
  startServer().then(({ port }) => {
    console.log(`Rising Tides is running. Open http://localhost:${port} in your browser.`);
  });
}

module.exports = { startServer };
