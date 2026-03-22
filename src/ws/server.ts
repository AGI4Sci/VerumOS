import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';

interface WebSocketEvent {
  type: string;
  sessionId?: string;
  payload?: unknown;
  timestamp?: number;
}

const clientsBySession = new Map<string, Set<Socket>>();

export function attachWebSocketServer(server: Server): void {
  server.on('upgrade', (request, socket) => {
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url || '/', `http://${host}`);

    if (url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = request.headers['sec-websocket-key'];
    const connection = request.headers.connection || '';
    const upgrade = request.headers.upgrade || '';

    if (typeof key !== 'string' || !connection.toLowerCase().includes('upgrade') || upgrade.toLowerCase() !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const acceptKey = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ].join('\r\n'));

    const sessionId = url.searchParams.get('sessionId') || 'anonymous';
    const clients = clientsBySession.get(sessionId) || new Set<Socket>();
    clients.add(socket);
    clientsBySession.set(sessionId, clients);

    sendEvent(socket, { type: 'connected', sessionId, timestamp: Date.now() });

    socket.on('data', (buffer) => {
      const message = decodeTextFrame(buffer);
      if (!message) {
        return;
      }
      if (message === '__close__') {
        socket.end();
        return;
      }
      try {
        const payload = JSON.parse(message) as { type?: string };
        if (payload.type === 'ping') {
          sendEvent(socket, { type: 'pong', sessionId, timestamp: Date.now() });
        }
      } catch {
        sendEvent(socket, { type: 'ack', sessionId, payload: { received: message }, timestamp: Date.now() });
      }
    });

    const cleanup = () => {
      const sessionClients = clientsBySession.get(sessionId);
      if (!sessionClients) {
        return;
      }
      sessionClients.delete(socket);
      if (sessionClients.size === 0) {
        clientsBySession.delete(sessionId);
      }
    };

    socket.on('close', cleanup);
    socket.on('end', cleanup);
    socket.on('error', cleanup);
  });
}

export function emitSessionEvent(sessionId: string, event: WebSocketEvent): void {
  const clients = clientsBySession.get(sessionId);
  if (!clients) {
    return;
  }

  for (const socket of clients) {
    sendEvent(socket, {
      ...event,
      sessionId,
      timestamp: event.timestamp || Date.now(),
    });
  }
}

function sendEvent(socket: Socket, event: WebSocketEvent): void {
  const payload = Buffer.from(JSON.stringify(event), 'utf8');
  socket.write(encodeTextFrame(payload));
}

function encodeTextFrame(payload: Buffer): Buffer {
  const header: number[] = [0x81];
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    const lengthBytes = Buffer.alloc(8);
    lengthBytes.writeBigUInt64BE(BigInt(payload.length));
    header.push(127, ...Array.from(lengthBytes));
  }
  return Buffer.concat([Buffer.from(header), payload]);
}

function decodeTextFrame(buffer: Buffer): string | null {
  if (buffer.length < 2) {
    return null;
  }

  const opcode = buffer[0] & 0x0f;
  if (opcode === 0x8) {
    return '__close__';
  }
  if (opcode !== 0x1) {
    return null;
  }

  let offset = 2;
  let payloadLength = buffer[1] & 0x7f;

  if (payloadLength === 126) {
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    payloadLength = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  const masked = (buffer[1] & 0x80) !== 0;
  if (!masked) {
    return buffer.subarray(offset, offset + payloadLength).toString('utf8');
  }

  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = buffer.subarray(offset, offset + payloadLength);
  const decoded = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    decoded[index] = payload[index] ^ mask[index % 4];
  }
  return decoded.toString('utf8');
}
