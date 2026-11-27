# Desktop compatibility fixtures

These manifests freeze representations that future migrations must continue to
read. They are descriptors, not complete Libraries or executable test payloads.
Tests may materialize the smallest directory tree needed for one descriptor in a
temporary directory, following the existing desktop test convention.

Each `manifest.json` uses this fixture-only shape:

- `schemaVersion`: version of the descriptor shape, currently `1`
- `id`: stable fixture identity
- `kind`: external or Pond representation under test
- `baseline`: minimal facts that identify the representation
- `compatibilityAssertions`: behavior a future reader or migration must preserve

Keep fixtures deterministic, anonymous, and free of credentials or personal
Library data. Add original bytes only when behavior depends on those bytes.
Record their source, checksum, and redistribution terms here before committing
them.

## Baselines

- `plaintext-pond-library`: current unencrypted Library layout and Save
  `info.json` schema
- `pond-package`: current directory-based `.pondpack` version 1 manifest
- `eagle-library`: unpacked Eagle Library structure accepted by the importer
- `locked-eagle-folders`: Eagle password markers and inherited exclusion
- `deep-links`: Library-bound and unbound Pond Save links
- `eaglepack`: Eagle 4.0.0 folder and custom-thumbnail transfer packages
- `share-page`: version 1 Share Page manifest embedded in an exported `index.html`,
  with a frozen example the current schema must keep parsing

The Eaglepack samples contain generated media and audit-only metadata. The
characterization records checksums, entry names, observed fields, and redaction
steps. Eagle writes one root `folder` object for folder exports; compatibility
tests must preserve that singular container shape and its nested children.
