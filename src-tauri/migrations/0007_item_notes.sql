-- An item's title is a sentence; notes hold whatever else belongs with it —
-- context, links, the paragraph the title stands for.

ALTER TABLE items ADD COLUMN notes TEXT;
