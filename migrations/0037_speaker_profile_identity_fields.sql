-- Portal bio identity fields. Nullable; speaker_profiles remains SoT.
ALTER TABLE speaker_profiles ADD COLUMN salutation TEXT;
ALTER TABLE speaker_profiles ADD COLUMN pronouns TEXT;
ALTER TABLE speaker_profiles ADD COLUMN honorific TEXT;
