export type PeriodMode = "fixed" | "rolling";
export type WeekStartsOn = "monday" | "sunday";

export type Profile = {
  id: string;
  display_name: string;
  height_cm: number | null;
  created_at: string;
  onboarded_at: string | null;
  period_mode: PeriodMode;
  week_starts_on: WeekStartsOn;
  checkin_hour: number | null;
};

export type WeightEntry = {
  id: string;
  user_id: string;
  measured_at: string; // YYYY-MM-DD
  weight_kg: number;
  note: string | null;
  source: "manual" | "import";
  created_at: string;
};

export type GoalMetric = "weight" | "waist" | "hip" | "arm" | "body_fat";

export type Goal = {
  id: string;
  user_id: string;
  metric: GoalMetric;
  label: string | null;
  weekly_rate: number;
  monthly_rate: number;
  quarterly_rate: number;
  semester_rate: number;
  target_value: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type GoalsHistoryEntry = {
  id: string;
  goal_id: string;
  user_id: string;
  metric: GoalMetric;
  weekly_rate: number;
  monthly_rate: number;
  quarterly_rate: number;
  semester_rate: number;
  target_value: number | null;
  created_at: string;
};

export type BodyMeasurement = {
  id: string;
  user_id: string;
  measured_at: string; // YYYY-MM-DD
  waist_cm: number | null;
  hip_cm: number | null;
  arm_cm: number | null;
  body_fat_pct: number | null;
  note: string | null;
  created_at: string;
};

export type UserAchievement = {
  id: string;
  user_id: string;
  achievement_key: string;
  unlocked_at: string;
};

export type ProgressPhoto = {
  id: string;
  user_id: string;
  photo_date: string; // formato YYYY-MM-DD
  storage_path: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      weight_entries: {
        Row: WeightEntry;
        Insert: Partial<WeightEntry> & { user_id: string; weight_kg: number };
        Update: Partial<WeightEntry>;
        Relationships: [];
      };
      goals: {
        Row: Goal;
        Insert: Partial<Goal> & { user_id: string; metric: GoalMetric };
        Update: Partial<Goal>;
        Relationships: [];
      };
      body_measurements: {
        Row: BodyMeasurement;
        Insert: Partial<BodyMeasurement> & { user_id: string; measured_at: string };
        Update: Partial<BodyMeasurement>;
        Relationships: [];
      };
      goals_history: {
        Row: GoalsHistoryEntry;
        Insert: Partial<GoalsHistoryEntry> & {
          goal_id: string;
          user_id: string;
          weekly_rate: number;
          monthly_rate: number;
          quarterly_rate: number;
          semester_rate: number;
        };
        Update: never; // append-only, sem policy de update
        Relationships: [];
      };
      user_achievements: {
        Row: UserAchievement;
        Insert: Partial<UserAchievement> & { user_id: string; achievement_key: string };
        Update: never; // conquistas não são editáveis
        Relationships: [];
      };
      progress_photos: {
        Row: ProgressPhoto;
        Insert: Partial<ProgressPhoto> & { user_id: string; photo_date: string; storage_path: string };
        Update: Partial<ProgressPhoto>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
