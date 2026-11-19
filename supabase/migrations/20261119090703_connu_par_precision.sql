-- Précision facultative quand la réponse est « autre ».
--
-- Les choix fermés de `connu_par` ne changent pas : l'analytique existante
-- continue de compter `autre` comme avant. Ce texte dit seulement ce que
-- « autre » voulait dire. Vide = null, jamais une chaîne blanche.
--
-- RLS : la politique « Users manage own profile » est FOR ALL, avec
-- `auth.uid() = id` en USING et en WITH CHECK. Elle porte sur la ligne
-- entière, donc sur cette colonne aussi. Les privilèges de `profiles` sont
-- accordés sur la table (`anon`, `authenticated`, `service_role`), pas
-- colonne par colonne : la nouvelle colonne est lisible et modifiable par
-- le lecteur sur sa propre ligne, sans politique supplémentaire.

alter table public.profiles
  add column if not exists connu_par_precision text;

alter table public.profiles drop constraint if exists profiles_connu_par_precision_ok;
alter table public.profiles
  add constraint profiles_connu_par_precision_ok check (
    connu_par_precision is null
    or (
      connu_par = 'autre'
      and char_length(connu_par_precision) between 1 and 200
      and connu_par_precision = btrim(connu_par_precision)
    )
  );

comment on column public.profiles.connu_par_precision is
  'Texte libre facultatif lorsque connu_par vaut « autre » (200 caractères maximum, déjà trimmé). Null si le lecteur n''a rien précisé, ou si la réponse n''est pas « autre ».';
