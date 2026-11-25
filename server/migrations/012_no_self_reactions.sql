-- Remove only reactions made by the author of the same message.
DELETE FROM reactions r USING messages m WHERE r.message_id=m.id AND r.user_id=m.sender_id;
