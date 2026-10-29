-- Curated studio demonstrations. No teaching profiles, authors or private drafts are republished.
with seeds(image_id,caption,alt) as (values
('0120dc16-33dc-4be0-85fe-0c5481ace3d8','Noted. Emotionally, no.','A tearful cat holds up a thumb.'),
('661e7caa-5d55-4625-b01f-abc475adef63','One small change. No tests needed.','SpongeBob and Patrick celebrate in front of a burning city.'),
('059e8e8a-70e7-4725-87ca-a951430da6a5','Arrived early to my own intervention.','Squidward sits nervously among empty waiting-room chairs.'),
('49c475be-cadb-45bd-a539-a95d6696af20','I was promised growth.','A raccoon reaches toward a rainbow.'),
('ae46d910-5ceb-455f-8b38-698e689cbd64','We both said quick question.','One cat swats another beside a sunny window.'),
('08eda2b3-feff-41d9-a12e-23c78ac7ce40','My contribution was raising the standard.','A tabby cat sits upright with a self-assured expression.'),
('ebd022c8-7236-499d-b85c-16cafb5068f4','Interesting definition of optional.','A woman pauses eating and gives a skeptical sideways glance.'),
('b416e0d5-8be3-4bf6-af11-3401bb3342a7','I read the abstract. Ask me anything.','A dog wears a cap and glasses in a close-up portrait.'))
insert into private.funny_posts(caption,alt,width,height,bucket,image_path,author_name,featured)
select s.caption,s.alt,i.width,i.height,'catalog',i.storage_path,'FunnyLLM studio',true from seeds s join public.cowriter_catalog i on i.id=s.image_id::uuid where i.available and not exists(select 1 from private.funny_posts p where p.owner_id is null and p.image_path=i.storage_path and p.caption=s.caption);
