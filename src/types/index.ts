export type FeedbackType = 'adore' | 'incomplete' | 'propose';

export interface Profile {
  id: string;
  city: string;
  notification_hour: string; // format HH:mm:ss
  expo_push_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Anecdote {
  id: string;
  city: string;
  title: string;
  body: string;
  source: string;
  status: 'draft' | 'validated' | 'rejected';
  reuse_count: number;
  created_at: string;
  validated_at: string | null;
}

export interface HistoryEntry {
  id: string;
  user_id: string;
  anecdote_id: string;
  sent_at: string;
  anecdote?: Anecdote;
}
