-- ELES LMS duplicate cleanup
--
-- This script removes duplicate announcements and forum topics created by
-- earlier synchronization tests while preserving the earliest record.
-- Run it only against the ELES LMS database after taking a backup.

START TRANSACTION;

-- Remove replies belonging to duplicate forum topics first so foreign-key
-- constraints cannot block removal of the duplicate topic rows.
DELETE r
FROM forum_replies r
JOIN forum_topics duplicate_topic ON duplicate_topic.id = r.topic_id
JOIN (
  SELECT MIN(id) AS keep_id, level_id, title, content, author_id
  FROM forum_topics
  GROUP BY level_id, title, content, author_id
  HAVING COUNT(*) > 1
) grouped ON grouped.level_id <=> duplicate_topic.level_id
          AND grouped.title = duplicate_topic.title
          AND grouped.content = duplicate_topic.content
          AND grouped.author_id = duplicate_topic.author_id
WHERE duplicate_topic.id <> grouped.keep_id;

-- Remove duplicate forum topics, keeping the earliest row.
DELETE t
FROM forum_topics t
JOIN (
  SELECT MIN(id) AS keep_id, level_id, title, content, author_id
  FROM forum_topics
  GROUP BY level_id, title, content, author_id
  HAVING COUNT(*) > 1
) grouped ON grouped.level_id <=> t.level_id
          AND grouped.title = t.title
          AND grouped.content = t.content
          AND grouped.author_id = t.author_id
WHERE t.id <> grouped.keep_id;

-- Remove duplicate announcements, keeping the earliest row.
DELETE a
FROM announcements a
JOIN (
  SELECT MIN(id) AS keep_id, level_id, title, content, author_id
  FROM announcements
  GROUP BY level_id, title, content, author_id
  HAVING COUNT(*) > 1
) grouped ON grouped.level_id <=> a.level_id
          AND grouped.title = a.title
          AND grouped.content = a.content
          AND grouped.author_id = a.author_id
WHERE a.id <> grouped.keep_id;

COMMIT;
