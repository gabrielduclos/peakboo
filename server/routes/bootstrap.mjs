export function registerBootstrap(app,{pool}){
app.get("/api/bootstrap", async (req, res) => {
  const rooms = (
    await pool.query(
      `SELECT r.id,r.kind,r.name,r.description,r.color,r.image,r.owner_id AS "ownerId",r.invite_code AS "inviteCode",m.joined_at AS "joinedAt",
       (SELECT count(*)::int FROM members WHERE room_id=r.id) AS "memberCount",
       lm.text AS "lastText",greatest(lm.created_at,lr.changed_at) AS "lastAt",
       CASE WHEN lr.changed_at IS NOT NULL AND (lm.created_at IS NULL OR lr.changed_at>=lm.created_at)
         THEN json_build_object('kind','reaction','actorName',lr.actor_name,'emoji',lr.emoji,'text',lr.text,'mime',lr.mime)
         WHEN lm.id IS NOT NULL THEN json_build_object('kind','message','senderId',lm.sender_id,'senderName',lm.sender_name,'text',lm.text,'mime',lm.mime,'deleted',lm.deleted,'eventId',lm.event_id)
       END AS preview,
       (SELECT count(*)::int FROM messages WHERE room_id=r.id AND created_at>m.last_read_at AND created_at>=m.joined_at AND sender_id<>$1) AS unread
       FROM rooms r JOIN members m ON m.room_id=r.id
       LEFT JOIN LATERAL (SELECT msg.*,u.name AS sender_name,media.mime FROM messages msg JOIN "user" u ON u.id=msg.sender_id LEFT JOIN media ON media.id=msg.attachment_id WHERE msg.room_id=r.id AND msg.created_at>=m.joined_at ORDER BY msg.created_at DESC,msg.id DESC LIMIT 1) lm ON true
       LEFT JOIN LATERAL (SELECT rx.changed_at,rx.emoji,u.name AS actor_name,msg.text,media.mime FROM messages msg JOIN reactions rx ON rx.message_id=msg.id JOIN "user" u ON u.id=rx.user_id LEFT JOIN media ON media.id=msg.attachment_id WHERE msg.room_id=r.id AND msg.sender_id=$1 AND rx.user_id<>$1 AND NOT msg.deleted AND msg.created_at>=m.joined_at AND rx.changed_at>=m.joined_at ORDER BY rx.changed_at DESC,rx.activity_id DESC LIMIT 1) lr ON true
       WHERE m.user_id=$1 AND r.kind='group' ORDER BY coalesce(greatest(lm.created_at,lr.changed_at),r.created_at) DESC,r.id LIMIT 100`,
      [req.user.id],
    )
  ).rows;
  const events = (
    await pool.query(
      `SELECT e.id,e.room_id AS "roomId",e.creator_id AS "creatorId",e.title,e.description,e.location,e.starts_at AS "startsAt",e.ends_at AS "endsAt",e.color,e.cancelled,r.name AS "roomName",COALESCE((SELECT json_agg(json_build_object('userId',v.user_id,'name',u.name,'status',v.status)) FROM rsvps v JOIN "user" u ON u.id=v.user_id WHERE v.event_id=e.id),'[]') AS rsvps FROM events e JOIN rooms r ON r.id=e.room_id JOIN members m ON m.room_id=e.room_id WHERE m.user_id=$1 AND r.kind='group' AND e.starts_at>now()-interval '1 year' AND e.starts_at<now()+interval '2 years' ORDER BY e.starts_at LIMIT 1000`,
      [req.user.id],
    )
  ).rows;
  const activity=(await pool.query(
    `SELECT a.id,a.event_id AS "eventId",e.room_id AS "roomId",e.title AS "eventTitle",r.name AS "roomName",a.action,u.name AS "actorName",a.created_at AS "createdAt" FROM event_activity a JOIN "user" u ON u.id=a.actor_id JOIN events e ON e.id=a.event_id JOIN rooms r ON r.id=e.room_id JOIN members m ON m.room_id=e.room_id LEFT JOIN push_muted_groups muted ON muted.room_id=r.id AND muted.user_id=$1 WHERE m.user_id=$1 AND r.kind='group' AND (a.action<>'confirmed' OR muted.user_id IS NULL) AND a.actor_id<>$1 AND a.created_at>=m.joined_at AND a.created_at>now()-interval '30 days' ORDER BY a.created_at DESC LIMIT 100`,[req.user.id])).rows;
  const reactionNotices=(await pool.query(
    `SELECT rx.activity_id AS id,msg.id AS "messageId",r.id AS "roomId",r.name AS "roomName",u.name AS "actorName",rx.emoji,msg.text,media.mime,rx.changed_at AS "createdAt"
      FROM reactions rx JOIN messages msg ON msg.id=rx.message_id JOIN rooms r ON r.id=msg.room_id JOIN members m ON m.room_id=r.id AND m.user_id=$1 JOIN "user" u ON u.id=rx.user_id LEFT JOIN media ON media.id=msg.attachment_id
      LEFT JOIN push_muted_groups muted ON muted.room_id=r.id AND muted.user_id=$1
      WHERE r.kind='group' AND msg.sender_id=$1 AND rx.user_id<>$1 AND NOT msg.deleted AND muted.user_id IS NULL AND msg.created_at>=m.joined_at AND rx.changed_at>=m.joined_at AND rx.changed_at>now()-interval '30 days' AND rx.activity_id IS NOT NULL
      ORDER BY rx.changed_at DESC,rx.activity_id DESC LIMIT 100`,[req.user.id])).rows;
  res.json({ user: req.user, rooms, events, activity, reactionNotices });
});
}
