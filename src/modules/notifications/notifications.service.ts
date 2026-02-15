import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ReminderJob } from './schemas/reminder-job.schema';
import { TenantsService } from '../tenants/tenants.service';
import { addMinutes } from 'date-fns';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(ReminderJob.name) private reminderJobModel: Model<ReminderJob>,
    @InjectQueue('reminders') private remindersQueue: Queue,
    private readonly tenantsService: TenantsService,
  ) {}

  /**
   * Schedule reminder jobs for an appointment based on tenant config.
   */
  async scheduleReminders(
    tenantId: string,
    appointmentId: string,
    startAt: Date,
  ): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const offsets = tenant.reminderOffsets || [
      { offsetMinutes: 1440, channels: ['whatsapp'] },
      { offsetMinutes: 120, channels: ['whatsapp'] },
    ];

    for (const offset of offsets) {
      for (const channel of offset.channels) {
        const scheduledFor = addMinutes(startAt, -offset.offsetMinutes);

        // Don't schedule if already in the past
        if (scheduledFor <= new Date()) {
          this.logger.warn(`Skipping reminder: scheduled time is in the past`);
          continue;
        }

        const reminderJob = await this.reminderJobModel.create({
          tenantId: new Types.ObjectId(tenantId),
          appointmentId: new Types.ObjectId(appointmentId),
          type: `REMINDER_${offset.offsetMinutes}M`,
          scheduledFor,
          channel,
          status: 'pending',
        });

        // Add BullMQ delayed job
        const delay = scheduledFor.getTime() - Date.now();
        const job = await this.remindersQueue.add(
          'send-reminder',
          {
            reminderJobId: (reminderJob as any)._id.toString(),
            tenantId,
            appointmentId,
            channel,
          },
          {
            delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60000 },
            removeOnComplete: true,
          },
        );

        await this.reminderJobModel.findByIdAndUpdate(
          (reminderJob as any)._id,
          { bullJobId: job.id.toString() },
        );

        this.logger.log(
          `Scheduled ${channel} reminder for appointment ${appointmentId} at ${scheduledFor.toISOString()}`,
        );
      }
    }
  }

  /**
   * Cancel all pending reminder jobs for an appointment.
   */
  async cancelReminders(appointmentId: string): Promise<void> {
    const jobs = await this.reminderJobModel.find({
      appointmentId: new Types.ObjectId(appointmentId),
      status: 'pending',
    });

    for (const job of jobs) {
      if (job.bullJobId) {
        try {
          const bullJob = await this.remindersQueue.getJob(job.bullJobId);
          if (bullJob) await bullJob.remove();
        } catch (error) {
          this.logger.warn(
            `Could not remove Bull job ${job.bullJobId}: ${(error as Error).message}`,
          );
        }
      }
      job.status = 'cancelled';
      await job.save();
    }

    this.logger.log(`Cancelled reminders for appointment ${appointmentId}`);
  }

  async findJobsByTenant(tenantId: string) {
    return this.reminderJobModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ scheduledFor: -1 })
      .limit(100)
      .lean();
  }
}
