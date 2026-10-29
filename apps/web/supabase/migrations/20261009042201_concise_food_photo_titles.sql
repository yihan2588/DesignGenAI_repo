-- Correct the original collection's fixed titles without changing generated text.
-- Match stable seed paths and previous titles so custom uploads/edits are preserved.
do $$
declare changed integer;
begin
  update public.food_photos as p
  set title = revised.title
  from (values
    ('food-01.jpg', 'Spicy noodle bowl', 'Spicy pork and greens'),
    ('food-02.jpg', 'Something slow-cooked', 'Braised pork belly'),
    ('food-03.jpg', 'A playful plate', 'Cream-filled waffles'),
    ('food-05.jpg', 'Salmon supper', 'Salmon with penne'),
    ('food-06.jpg', 'Green and bright', 'Broad beans and edamame'),
    ('food-07.jpg', 'Mushroom stir-fry', 'Rice cake stir-fry'),
    ('food-08.jpg', 'A savory bowl', 'Meat and vegetable stir-fry'),
    ('food-09.jpg', 'Greens and glaze', 'Glazed meat with bok choy'),
    ('food-10.jpg', 'Dinner in good company', 'Seared meat with potatoes'),
    ('food-11.jpg', 'Noodles to share', 'Creamy pasta with meat')
  ) as revised(storage_path, previous_title, title)
  where p.storage_path = revised.storage_path
    and p.title = revised.previous_title
    and p.owner_id is null;

  get diagnostics changed = row_count;
  if changed <> 10 then
    raise exception 'Expected to revise 10 original photo titles; revised %. Review the collection before retrying.', changed;
  end if;
end $$;
