-- Egen kundespesifikk kanal for notater som deles med teamet.
alter type public.message_channel add value if not exists 'customer_team';
