import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(EventsGateway.name);

  handleConnection(client: Socket): void {
    const tenantId = client.handshake.query.tenantId as string;
    if (tenantId) {
      void client.join(`tenant:${tenantId}`);
      this.logger.log(`WS connected: ${client.id} → tenant:${tenantId}`);
    } else {
      this.logger.warn(`WS connected without tenantId, disconnecting: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`WS disconnected: ${client.id}`);
  }

  /**
   * Emit a real-time event to all sockets belonging to a tenant room.
   */
  emitToTenant(tenantId: string, event: string, data: unknown): void {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }
}
