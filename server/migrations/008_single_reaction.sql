-- Legacy rows do not have a timestamp. Preserve one deterministic emoji per actor/message.
DELETE FROM reactions r USING (
 SELECT message_id,user_id,emoji,
 ROW_NUMBER() OVER(PARTITION BY message_id,user_id ORDER BY emoji COLLATE "C") AS n
 FROM reactions
) duplicate
WHERE duplicate.n>1 AND r.message_id=duplicate.message_id AND r.user_id=duplicate.user_id AND r.emoji=duplicate.emoji;
CREATE UNIQUE INDEX IF NOT EXISTS reactions_one_per_user_message ON reactions(message_id,user_id);
