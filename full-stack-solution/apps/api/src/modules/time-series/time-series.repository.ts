import type {
  CreateReadingsInput,
  DeleteReadingsResult,
  InsertReadingsResult,
  Reading,
  ReadingsMetrics,
  ReadingsRangeQuery,
  TimeSeriesCount,
} from "@full-stack-solution/shared";
import type { PrismaClient } from "../../generated/prisma/client";

export interface TimeSeriesRepository {
  pointBelongsToUser(pointId: string, userId: string): Promise<boolean>;

  insertReadings(
    pointId: string,
    input: CreateReadingsInput,
  ): Promise<InsertReadingsResult>;

  getReadings(pointId: string, query: ReadingsRangeQuery): Promise<Reading[]>;

  getMetrics(
    pointId: string,
    query: ReadingsRangeQuery,
  ): Promise<ReadingsMetrics>;

  countByUser(userId: string): Promise<TimeSeriesCount>;

  deleteReadings(
    pointId: string,
    query: ReadingsRangeQuery,
  ): Promise<DeleteReadingsResult>;
}

function buildDateRange(query: ReadingsRangeQuery) {
  const gte = query.from ? new Date(query.from) : undefined;
  const lte = query.to ? new Date(query.to) : undefined;
  if (!gte && !lte) return undefined;
  return { ...(gte && { gte }), ...(lte && { lte }) };
}

function buildWhere(pointId: string, query: ReadingsRangeQuery) {
  const timestamp = buildDateRange(query);
  return { monitoringPointId: pointId, ...(timestamp && { timestamp }) };
}

export class PrismaTimeSeriesRepository implements TimeSeriesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async pointBelongsToUser(pointId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.monitoringPoint.findFirst({
      where: { id: pointId, createdById: userId },
      select: { id: true },
    });
    return row !== null;
  }

  async insertReadings(
    pointId: string,
    { readings }: CreateReadingsInput,
  ): Promise<InsertReadingsResult> {
    const result = await this.prisma.reading.createManyAndReturn({
      data: readings.map(({ timestamp, value }) => ({
        monitoringPointId: pointId,
        timestamp: new Date(timestamp),
        value,
      })),
      skipDuplicates: true,
    });

    return { received: readings.length, inserted: result.length };
  }

  async getReadings(
    pointId: string,
    query: ReadingsRangeQuery,
  ): Promise<Reading[]> {
    const rows = await this.prisma.reading.findMany({
      where: buildWhere(pointId, query),
      orderBy: { timestamp: "asc" },
      select: { timestamp: true, value: true },
    });

    return rows.map((r) => ({
      timestamp: r.timestamp.toISOString(),
      value: r.value,
    }));
  }

  async getMetrics(
    pointId: string,
    query: ReadingsRangeQuery,
  ): Promise<ReadingsMetrics> {
    const agg = await this.prisma.reading.aggregate({
      where: buildWhere(pointId, query),
      _count: { timestamp: true },
      _min: { value: true, timestamp: true },
      _max: { value: true, timestamp: true },
      _avg: { value: true },
    });

    const count = agg._count.timestamp;
    if (count === 0) {
      return {
        count: 0,
        min: null,
        max: null,
        avg: null,
        firstTimestamp: null,
        lastTimestamp: null,
      };
    }

    return {
      count,
      min: agg._min.value,
      max: agg._max.value,
      avg: agg._avg.value,
      firstTimestamp: agg._min.timestamp?.toISOString() ?? null,
      lastTimestamp: agg._max.timestamp?.toISOString() ?? null,
    };
  }

  async countByUser(userId: string): Promise<TimeSeriesCount> {
    const count = await this.prisma.reading.count({
      where: { monitoringPoint: { createdById: userId } },
    });
    return { count };
  }

  async deleteReadings(
    pointId: string,
    query: ReadingsRangeQuery,
  ): Promise<DeleteReadingsResult> {
    const { count } = await this.prisma.reading.deleteMany({
      where: buildWhere(pointId, query),
    });
    return { deleted: count };
  }
}
