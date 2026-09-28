/**
 * Hand-written to match supabase/migrations. Once the project is linked you can
 * regenerate it with:
 *   npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProfileEventKind = "view" | "vcard" | "link_click" | "pass_apple" | "pass_google";
export type ProfileEventSource = "direct" | "qr" | "share";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          slug: string;
          full_name: string;
          headline: string;
          company: string;
          location: string;
          pronouns: string;
          bio: string;
          accent_color: string;
          avatar_path: string | null;
          links: Json;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          slug: string;
          full_name?: string;
          headline?: string;
          company?: string;
          location?: string;
          pronouns?: string;
          bio?: string;
          accent_color?: string;
          avatar_path?: string | null;
          links?: Json;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          full_name?: string;
          headline?: string;
          company?: string;
          location?: string;
          pronouns?: string;
          bio?: string;
          accent_color?: string;
          avatar_path?: string | null;
          links?: Json;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profile_events: {
        Row: {
          id: number;
          profile_id: string;
          kind: ProfileEventKind;
          source: ProfileEventSource;
          link_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          profile_id: string;
          kind: ProfileEventKind;
          source?: ProfileEventSource;
          link_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          profile_id?: string;
          kind?: ProfileEventKind;
          source?: ProfileEventSource;
          link_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      wallet_pass_secrets: {
        Row: {
          profile_id: string;
          apple_auth_token: string;
          created_at: string;
        };
        Insert: {
          profile_id: string;
          apple_auth_token?: string;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          apple_auth_token?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      auth_otp_attempts: {
        Row: { id: number; email_hash: string; created_at: string };
        Insert: { id?: never; email_hash: string; created_at?: string };
        Update: { id?: never; email_hash?: string; created_at?: string };
        Relationships: [];
      };
      apple_pass_registrations: {
        Row: {
          device_library_id: string;
          pass_type_id: string;
          serial_number: string;
          push_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          device_library_id: string;
          pass_type_id: string;
          serial_number: string;
          push_token: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          device_library_id?: string;
          pass_type_id?: string;
          serial_number?: string;
          push_token?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_public_card: { Args: { p_slug: string }; Returns: Json };
      is_slug_available: { Args: { p_slug: string }; Returns: boolean };
      get_card_stats: { Args: { p_days?: number }; Returns: Json };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
