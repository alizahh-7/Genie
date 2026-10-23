insert into circle_invite (token, person_id)
select 'demo-' || p.id::text, p.id
from person p
where p.id in ('eae4b68b-bf24-4e1e-b2aa-f7d2ebd3e8e5','07559dff-4bb4-4cc7-b8a7-fcb9aa239ee0')
on conflict do nothing;

delete from circle_response
where person_id in ('eae4b68b-bf24-4e1e-b2aa-f7d2ebd3e8e5','07559dff-4bb4-4cc7-b8a7-fcb9aa239ee0')
  and contributor_first_name in ('Ayesha','Imran','Minho','Jiwoo');

insert into circle_response (token, person_id, contributor_first_name, answers, consent_given, created_at)
select 'demo-' || p.id::text, p.id, v.who, v.answers::jsonb, true, now()
from person p
join (values
  ('Nani', 'Ayesha', '{"music": "Every evening after asr she hummed Lag Jaa Gale while folding clothes. She never finished it. She always stopped at the same spot and smiled.", "joy": "When someone sang with her. She would pretend not to know the words, then know every one."}'),
  ('Nani', 'Imran', '{"food": "Haleem in Ramzan. She stirred the pot for hours and never let anyone else touch it.", "place": "Every Eid she took us to Charminar for bangles. She bargained like it was a sport."}'),
  ('Sana', 'Minho', '{"music": "She kept the radio on all day and sang along under her breath.", "joy": "Rainy afternoons with the whole family in one room, nobody doing anything."}'),
  ('Sana', 'Jiwoo', '{"food": "Her mother made soup on cold mornings. She said it fixed everything."}')
) as v(first_name, who, answers) on v.first_name = p.first_name
where p.id in ('eae4b68b-bf24-4e1e-b2aa-f7d2ebd3e8e5','07559dff-4bb4-4cc7-b8a7-fcb9aa239ee0');