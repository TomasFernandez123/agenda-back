import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Public } from '../../common/decorators';

@Controller('health')
@Public()
export class HealthController {
  constructor(@InjectConnection() private connection: Connection) {}

  @Get()
  check() {
    const dbState = this.connection.readyState;
    const dbStates: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    return {
      status: dbState === 1 ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbStates[dbState] || 'unknown',
    };
  }
}
