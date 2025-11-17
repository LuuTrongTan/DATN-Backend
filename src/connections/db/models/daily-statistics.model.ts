// DailyStatistics Model - Based on migration 011_create_daily_statistics_table

export interface DailyStatistics {
  id: number;
  date: Date;
  total_orders: number;
  total_revenue: number; // DECIMAL(10, 2)
  total_users: number;
  created_at: Date;
}

export interface CreateDailyStatisticsInput {
  date: Date;
  total_orders?: number;
  total_revenue?: number;
  total_users?: number;
}

export interface UpdateDailyStatisticsInput {
  total_orders?: number;
  total_revenue?: number;
  total_users?: number;
}

