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
  plan: "free" | "pro";
  plan_expires_at: string | null;
  kiwify_order_id: string | null;
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

export type ChallengeType = "progress" | "habit";
export type ChallengeStatus = "active" | "completed" | "failed";

export type Challenge = {
  id: string;
  user_id: string;
  type: ChallengeType;
  metric: GoalMetric | null; // null quando type === "habit"
  template_key: string | null;
  label: string;
  // progress: quantidade a reduzir, na unidade da métrica (kg/cm/p.p.)
  // habit: número de dias consecutivos
  target_value: number;
  // progress: valor da métrica capturado na criação. habit: sempre null.
  baseline_value: number | null;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  status: ChallengeStatus;
  completed_at: string | null;
  created_at: string;
};

export type CoachLinkStatus = "pending" | "active" | "revoked";

export type CoachLink = {
  id: string;
  owner_user_id: string;
  coach_user_id: string | null;
  invite_code: string;
  status: CoachLinkStatus;
  owner_display_name: string;
  coach_display_name: string | null;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
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
      challenges: {
        Row: Challenge;
        Insert: Partial<Challenge> & {
          user_id: string;
          type: ChallengeType;
          label: string;
          target_value: number;
          end_date: string;
        };
        Update: Partial<Challenge>;
        Relationships: [];
      };
      coach_links: {
        Row: CoachLink;
        Insert: Partial<CoachLink> & { owner_user_id: string; invite_code: string; owner_display_name: string };
        Update: Partial<CoachLink>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
