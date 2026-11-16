-- « Comment as-tu connu Anecto ? » : une réponse facultative par lecteur.
--
-- Sur le profil, comme demandé. `connu_par_le` est rempli aussi quand le
-- lecteur passe la question : elle n'est posée qu'une fois.
--
-- RLS : la politique existante « Users manage own profile » suffit, chacun
-- n'écrit que sa propre ligne.
alter table public.profiles
  add column if not exists connu_par text
    check (connu_par in ('proche', 'whatsapp_sms', 'facebook', 'instagram', 'tiktok', 'store', 'autre')),
  add column if not exists connu_par_le timestamptz;

comment on column public.profiles.connu_par is
  'Réponse à « Comment as-tu connu Anecto ? ». Nul si le lecteur a passé la question.';
comment on column public.profiles.connu_par_le is
  'Date de la réponse ou du refus : la question ne se repose pas.';
