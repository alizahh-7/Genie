alter table wish_maker add column if not exists last_recovery_at timestamptz;

update wish_maker set country = case city
  when 'Hyderabad' then 'India' when 'Pune' then 'India'
  when 'Chennai' then 'India' when 'Goa' then 'India'
  when 'Mexico City' then 'Mexico' when 'Seoul' then 'South Korea'
  when 'Beirut' then 'Lebanon' when 'Naples' then 'Italy'
  when 'Austin' then 'United States' when 'Chicago' then 'United States'
  when 'Manila' then 'Philippines' else country end
where is_sample = true and country is null;