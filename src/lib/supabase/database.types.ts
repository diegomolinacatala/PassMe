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
          detail_color: string | null;
          pattern: string;
          pattern_seed: number;
          typeface: string;
          avatar_path: string | null;
          links: Json;
          is_published: boolean;
          accepts_contact_requests: boolean;
          accepts_meeting_requests: boolean;
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
          detail_color?: string | null;
          pattern?: string;
          pattern_seed?: number;
          typeface?: string;
          avatar_path?: string | null;
          links?: Json;
          is_published?: boolean;
          accepts_contact_requests?: boolean;
          accepts_meeting_requests?: boolean;
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
          detail_color?: string | null;
          pattern?: string;
          pattern_seed?: number;
          typeface?: string;
          avatar_path?: string | null;
          links?: Json;
          is_published?: boolean;
          accepts_contact_requests?: boolean;
          accepts_meeting_requests?: boolean;
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
      contact_requests: {
        Row: {
          id: string;
          profile_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          company: string;
          message: string;
          source: ProfileEventSource;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          company?: string;
          message?: string;
          source?: ProfileEventSource;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          company?: string;
          message?: string;
          source?: ProfileEventSource;
          created_at?: string;
        };
        Relationships: [];
      };
      meeting_requests: {
        Row: {
          id: string;
          profile_id: string;
          status: "pending" | "confirmed" | "declined" | "cancelled";
          proposed_by: "guest" | "owner";
          slots: string[];
          confirmed_start: string | null;
          duration_minutes: number;
          format: "in_person" | "video" | "phone";
          location: string;
          time_zone: string;
          topic: string;
          guest_name: string;
          guest_email: string;
          guest_phone: string | null;
          guest_company: string;
          response_note: string;
          closed_by: "guest" | "owner" | null;
          sequence: number;
          source: ProfileEventSource;
          created_at: string;
          updated_at: string;
        };
        // Rows are created by submit_meeting_request() only.
        Insert: { id?: never };
        Update: {
          status?: "pending" | "confirmed" | "declined" | "cancelled";
          proposed_by?: "guest" | "owner";
          slots?: string[];
          confirmed_start?: string | null;
          location?: string;
          response_note?: string;
          closed_by?: "guest" | "owner" | null;
          sequence?: number;
        };
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
      resolve_slug_redirect: { Args: { p_slug: string }; Returns: string | null };
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: Array<{ allowed: boolean; retry_after: number }>;
      };
      record_card_event: {
        Args: { p_slug: string; p_kind: string; p_source?: string; p_link_id?: string | null };
        Returns: boolean;
      };
      submit_contact_request: {
        Args: {
          p_slug: string;
          p_name: string;
          p_email: string | null;
          p_phone: string | null;
          p_company: string;
          p_message: string;
          p_source?: string;
        };
        Returns: string | null;
      };
      submit_meeting_request: {
        Args: {
          p_slug: string;
          p_guest_name: string;
          p_guest_email: string;
          p_guest_phone: string | null;
          p_guest_company: string;
          p_topic: string;
          p_format: string;
          p_location: string;
          p_duration_minutes: number;
          p_time_zone: string;
          p_slots: string[];
          p_source?: string;
        };
        Returns: Json;
      };
      cleanup_expired_data: { Args: Record<string, never>; Returns: Json };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ContactRequestRow = Database["public"]["Tables"]["contact_requests"]["Row"];
export type MeetingRequestRow = Database["public"]["Tables"]["meeting_requests"]["Row"];
