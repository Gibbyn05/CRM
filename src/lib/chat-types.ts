// Forfatter-info brukt i chat (navn + profilbilde).
export interface AuthorInfo {
  name: string;
  avatar_url: string | null;
}

export type AuthorMap = Record<string, AuthorInfo>;
