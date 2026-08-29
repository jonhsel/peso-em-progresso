export type Profile = {
  id: string;
  display_name: string;
  height_cm: number | null;
  created_at: string;
  onboarded_at: string | null;
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

export type Goals = {
  user_id: string;
  weekly_loss_kg: number;
  monthly_loss_kg: number;
  quarterly_loss_kg: number;
  semester_loss_kg: number;
  target_weight_kg: number | null;
  updated_at: string;
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
        Row: Goals;
        Insert: Partial<Goals> & { user_id: string };
        Update: Partial<Goals>;
        Relationships: [];
      };
      body_measurements: {
        Row: BodyMeasurement;
        Insert: Partial<BodyMeasurement> & { user_id: string; measured_at: string };
        Update: Partial<BodyMeasurement>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
