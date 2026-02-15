import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Availability } from './schemas/availability.schema';
import { SetAvailabilityDto } from './dto/availability.dto';
import { format, getDay, parse } from 'date-fns';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(Availability.name) private availabilityModel: Model<Availability>,
  ) {}

  async setAvailability(
    tenantId: string,
    professionalId: string,
    dto: SetAvailabilityDto,
  ): Promise<Availability> {
    return this.availabilityModel.findOneAndUpdate(
      {
        tenantId: new Types.ObjectId(tenantId),
        professionalId: new Types.ObjectId(professionalId),
      },
      {
        $set: {
          weeklyRules: dto.weeklyRules,
          exceptions: dto.exceptions || [],
        },
        $setOnInsert: {
          tenantId: new Types.ObjectId(tenantId),
          professionalId: new Types.ObjectId(professionalId),
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
  }

  async getAvailability(tenantId: string, professionalId: string): Promise<Availability | null> {
    return this.availabilityModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        professionalId: new Types.ObjectId(professionalId),
      })
      .lean();
  }

  /**
   * Check if a time slot falls within the professional's availability.
   * Returns true if the slot (startAt-endAt) is covered by the professional's schedule.
   */
  async isSlotAvailable(
    tenantId: string,
    professionalId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<boolean> {
    const availability = await this.getAvailability(tenantId, professionalId);
    if (!availability) return false;

    const dateStr = format(startAt, 'yyyy-MM-dd');
    const dayOfWeek = getDay(startAt); // 0=Sunday ... 6=Saturday

    // Check exceptions first
    const exception = availability.exceptions?.find((e) => e.date === dateStr);
    if (exception) {
      if (exception.type === 'blocked') {
        // If blocked with no ranges, entire day is blocked
        if (!exception.ranges || exception.ranges.length === 0) return false;
        // If blocked with specific ranges, those ranges are blocked
        return !this.isTimeInRanges(startAt, endAt, exception.ranges);
      }
      if (exception.type === 'extra') {
        // Extra availability: check if time is within exception ranges
        return this.isTimeInRanges(startAt, endAt, exception.ranges);
      }
    }

    // Check weekly rules
    const dayRule = availability.weeklyRules?.find((r) => r.day === dayOfWeek);
    if (!dayRule || !dayRule.ranges || dayRule.ranges.length === 0) return false;

    return this.isTimeInRanges(startAt, endAt, dayRule.ranges);
  }

  private isTimeInRanges(
    startAt: Date,
    endAt: Date,
    ranges: { start: string; end: string }[],
  ): boolean {
    const startTime = format(startAt, 'HH:mm');
    const endTime = format(endAt, 'HH:mm');

    return ranges.some((range) => {
      return startTime >= range.start && endTime <= range.end;
    });
  }
}
