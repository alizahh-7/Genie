-- Fictional family memories for the two demo people (Nani and Sana).
-- Run once in the Supabase SQL editor. Safe to run again: it replaces these contributors' answers.
-- /demo/start copies these answers into each new demo person, so they appear in the Wish Book.
-- Rules: fictional only, no song or film lyrics or dialogue, no medical wording, under 500 characters per answer.
insert into circle_invite (token, person_id)
select 'demo-' || p.id::text, p.id
from person p
where p.id in ('eae4b68b-bf24-4e1e-b2aa-f7d2ebd3e8e5','07559dff-4bb4-4cc7-b8a7-fcb9aa239ee0')
on conflict do nothing;

delete from circle_response
where person_id in ('eae4b68b-bf24-4e1e-b2aa-f7d2ebd3e8e5','07559dff-4bb4-4cc7-b8a7-fcb9aa239ee0')
  and contributor_first_name in ('Ayesha','Imran','Farhan','Minho','Jiwoo','Dahye');

insert into circle_response (token, person_id, contributor_first_name, answers, consent_given, created_at)
select 'demo-' || p.id::text, p.id, v.who, v.answers::jsonb, true, now()
from person p
join (values
  ('Nani', 'Ayesha', '{"music": "Every evening after asr she hummed Lag Jaa Gale while folding the clean clothes into neat squares. She never reached the end of it. She stopped at the same place every time, smiled to herself, and started the stack again.", "joy": "When someone sang with her. She would pretend not to know the words, then know every single one. Afterwards she would ask who taught you that, as if the song were her own secret."}'),
  ('Nani', 'Imran', '{"food": "Haleem in Ramzan. She started before dawn, stirred the pot for hours with the same wooden spoon, and never let anyone else touch it. The first bowl always went to the children next door, and then to us.", "place": "Every Eid she took us to Charminar for bangles. She bargained like it was a sport, walked away twice, and still came back with the ones she wanted and an extra pair for me."}'),
  ('Nani', 'Farhan', '{"film": "Mughal-e-Azam was her film. She watched it with the curtains drawn and the fan switched off, and she told you which scene was coming a minute before it came. Nobody was allowed to speak during the mirror hall.", "joy": "Her house always smelled of cardamom. When everyone was in one room, loud and talking over each other, she sat in her chair and said nothing, and you could tell it was the happiest she ever was."}'),
  ('Sana', 'Minho', '{"music": "She kept the radio on all day and sang along under her breath, even while she was doing something else. When a BTS song came on she turned it up and pretended it was for me.", "joy": "Rainy afternoons with the whole family in one room, nobody doing anything. She called it the best kind of day."}'),
  ('Sana', 'Jiwoo', '{"food": "Her mother made soup on cold mornings, and Sana said it fixed everything. She also loved the spicy rice cakes from the cart outside her school, and ate them standing up with her sleeves pulled over her hands.", "place": "Busan. She said the sea there sounded like it was thinking. We went every summer, and she always waded in up to her knees with her shoes in her hand."}'),
  ('Sana', 'Dahye', '{"film": "She watched Descendants of the Sun twice in one week and then made all of us watch it too. She sent screenshots of her favourite scenes at midnight with no message, just the picture.", "joy": "The sea at dawn, before anyone else was awake. She sent photos of it with no words, and you knew exactly what she meant."}')
) as v(first_name, who, answers) on v.first_name = p.first_name
where p.id in ('eae4b68b-bf24-4e1e-b2aa-f7d2ebd3e8e5','07559dff-4bb4-4cc7-b8a7-fcb9aa239ee0');