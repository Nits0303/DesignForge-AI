-- Sprint 17: review claim timestamp + full-text search on Template

ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "reviewClaimedAt" TIMESTAMP(3);

ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

UPDATE "Template" SET "search_vector" =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce("marketplaceDescription", '')), 'B') ||
  setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'C')
WHERE "search_vector" IS NULL;

CREATE INDEX IF NOT EXISTS "Template_search_vector_idx" ON "Template" USING GIN ("search_vector");

CREATE OR REPLACE FUNCTION template_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."marketplaceDescription", '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS template_search_vector_trigger ON "Template";
CREATE TRIGGER template_search_vector_trigger
BEFORE INSERT OR UPDATE OF name, "marketplaceDescription", tags ON "Template"
FOR EACH ROW EXECUTE PROCEDURE template_search_vector_update();
