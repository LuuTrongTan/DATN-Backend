// DailyStatistics Model - Based on database_schema.dbml

export interface DailyStatistics {
  id: number;
  date: Date; // unique, not null
  total_orders: number; // default: 0
  total_revenue: number; // DECIMAL(10, 2) - default: 0
  total_users: number; // default: 0
  created_at: Date;
}

export interface CreateDailyStatisticsInput {
  date: Date; // REQUIRED - unique
  total_orders?: number; // default: 0
  total_revenue?: number; // default: 0
  total_users?: number; // default: 0
}

export interface UpdateDailyStatisticsInput {
  total_orders?: number;
  total_revenue?: number;
  total_users?: number;
}

