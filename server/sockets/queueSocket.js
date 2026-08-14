function initQueueSocket(io) {
  io.on('connection', (socket) => {
    console.log(`Socket client connected: ${socket.id}`);

    // Join room for a specific facility department queue updates
    socket.on('join:facility', ({ facilityId, department }) => {
      const room = `facility:${facilityId}:${department}`;
      socket.join(room);
      console.log(`Socket ${socket.id} joined facility department room: ${room}`);
    });

    // Join room for specific token dynamic updates
    socket.on('join:token', ({ tokenId }) => {
      const room = `token:${tokenId}`;
      socket.join(room);
      console.log(`Socket ${socket.id} joined token room: ${room}`);
    });

    // Leave a room if needed
    socket.on('leave:facility', ({ facilityId, department }) => {
      const room = `facility:${facilityId}:${department}`;
      socket.leave(room);
      console.log(`Socket ${socket.id} left room: ${room}`);
    });

    socket.on('leave:token', ({ tokenId }) => {
      const room = `token:${tokenId}`;
      socket.leave(room);
      console.log(`Socket ${socket.id} left room: ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket client disconnected: ${socket.id}`);
    });
  });
}

module.exports = initQueueSocket;
