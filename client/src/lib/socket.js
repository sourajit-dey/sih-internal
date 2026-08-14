import { io } from 'socket.io-client';

// Fallback to localhost, and ensure we strip the '/api' suffix for WebSocket connections
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl;

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true
});
