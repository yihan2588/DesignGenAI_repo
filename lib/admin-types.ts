import type { PromptConfig } from "./humor/configured";
import type { Matchup } from "./arena";
export type Revision = PromptConfig & {
  engine?: "direct" | "planned"; // Historical provenance only; generation uses editable text.
  archived: boolean;
  created_at: string;
  parent_id: string | null;
};
export type Snapshot = {
  metrics: {
    profiles: number;
    images: number;
    ready: number;
    failed: number;
    votes: number;
    voters: number;
    unmapped_votes: number;
  };
  active: { first_id: string; second_id: string };
  prompts: Revision[];
  profiles: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    is_superadmin: boolean;
    created_at: string;
  }[];
  media: {
    id: string;
    owner_id: string;
    title: string;
    alt_text: string;
    storage_path: string;
    created_at: string;
    runs: {
      id: string;
      status: string;
      caption_a: string | null;
      caption_b: string | null;
    }[];
  }[];
  votes: {
    run_id: string;
    user_id: string;
    choice: string;
    title: string;
    created_at: string;
  }[];
  matchups: Matchup[];
  daily: { day: string; votes: number }[];
};
