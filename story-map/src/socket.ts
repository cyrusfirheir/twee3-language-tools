import socketio from 'socket.io-client';

const socket = socketio.io('http://localhost:42069'); // TODO: On production this should probably be `${location.protocol}//${location.host}`, but this is <3 for `npm run serve`
export { socket };
