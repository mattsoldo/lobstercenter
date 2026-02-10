-- Add optional code_url and code_commit_sha to techniques
-- For techniques that involve actual code (skills, tools, integrations),
-- this links to the GitHub repo where the code lives.

ALTER TABLE techniques ADD COLUMN code_url VARCHAR(2048);
ALTER TABLE techniques ADD COLUMN code_commit_sha VARCHAR(40);
