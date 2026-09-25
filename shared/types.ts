export type Role = "ADMIN" | "LEADER" | "VOLUNTEER";
export type ScheduleStatus = "PENDING" | "CONFIRMED" | "DECLINED";
export type SwapStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  max_services_per_month: number;
  avatar_url: string | null;
  account_status?: string;
  created_at: string;
}

export interface Ministry {
  id: number;
  name: string;
  description: string | null;
  leader_id: number | null;
  leader_ids?: number[];
  leader_name?: string | null;
  roles?: MinistryRole[];
  member_count?: number;
}

export interface MinistryRole {
  id: number;
  ministry_id: number;
  name: string;
}

export interface EventItem {
  id: number;
  title: string;
  event_date: string;
  location: string | null;
  slots?: Schedule[];
}

export interface Schedule {
  id: number;
  event_id: number;
  role_id: number;
  user_id: number | null;
  status: ScheduleStatus;
  notes: string | null;
  event_title?: string;
  event_date?: string;
  location?: string | null;
  role_name?: string;
  ministry_name?: string;
  user_name?: string | null;
}

export interface Unavailability {
  id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  reason: string | null;
}

export interface SwapRequest {
  id: number;
  schedule_id: number;
  requester_id: number;
  target_user_id: number | null;
  status: SwapStatus;
  created_at: string;
  requester_name?: string;
  target_user_name?: string | null;
  event_title?: string;
  event_date?: string;
  role_name?: string;
  current_user_name?: string | null;
}

export interface Candidate {
  user_id: number;
  name: string;
  email: string;
  services_this_month: number;
  max_services_per_month: number;
}

export interface ParticipationRow {
  user_id: number;
  name: string;
  confirmed: number;
  pending: number;
  declined: number;
  total: number;
}

export interface PlaylistSummary {
  id: number;
  event_id: number;
  created_at: string;
  title: string;
  event_date: string;
  location: string | null;
  song_count: number;
}

export interface PlaylistEvent {
  id: number;
  title: string;
  event_date: string;
  location: string | null;
}

export interface PlaylistSong {
  id: number;
  playlist_id: number;
  title: string;
  key: string | null;
  youtube_url: string;
  note: string | null;
  position: number;
}

export interface PlaylistDetail {
  event: PlaylistEvent;
  playlist: { id: number; event_id: number; created_by: number; created_at: string } | null;
  songs: PlaylistSong[];
}
