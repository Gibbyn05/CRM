-- Egen kanal for en lukket lederlogg. Policyene legges i neste migrasjon
-- fordi en ny enum-verdi først kan brukes etter at ALTER TYPE er committet.
alter type public.message_channel add value if not exists 'manager';
