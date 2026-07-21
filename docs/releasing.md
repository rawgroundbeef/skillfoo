# Releasing `skillfoo@1.0.0`

This runbook separates reversible release preparation from public writes. No step authorizes a
later step implicitly. Never read, copy, print, or commit npm credentials, OTPs, authentication
output, or a user `.npmrc`.

## 1. Pre-merge release readiness

On the complete committed `release-readiness` branch:

```sh
npm ci
npm run check
npm run test:package
npm run test:release-modes
git diff --check main...HEAD
```

Inspect a real candidate pack in an owned temporary directory, then delete that disposable
candidate. Confirm its identity, shasum, integrity, and exact file list. The PR must run
`npm run check`, `npm run test:package`, and `npm run test:release-modes` on the Node 22/24
Ubuntu, macOS, and Windows matrix plus exact Node `22.0.0` and `24.0.0` Ubuntu lower-bound
jobs. The release-mode harness requires a clean committed checkout because it exercises the
same commit-binding manifest path used after merge.

Review and merge the PR with no `v1.0.0` tag, GitHub release, npm publication, publish token,
or automatically firing publication workflow. Merge is not publication authorization.

## 2. Build the retained artifact once, without public-write authority

In a clean detached checkout of the exact merged commit intended for `v1.0.0`, use an owned
release directory outside the repository and isolated, non-secret npm cache/user config.
Build exactly one retained artifact:

```sh
npm ci
npm pack --json --pack-destination /absolute/owned/release-directory
npm run test:package -- \
  --tarball /absolute/owned/release-directory/skillfoo-1.0.0.tgz \
  --manifest /absolute/owned/release-directory/release-manifest.json
```

Supplied-tarball mode runs the complete package suite without packing, deleting, or modifying
the supplied file. The manifest binds the commit, intended tag, package/version, private
absolute path, filename, SHA-256, npm SHA-1 shasum, npm SHA-512 integrity, size, and verification
results. Stop here. Do not pack again after the manifest is created.

The human privately confirms npm CLI authentication against `https://registry.npmjs.org/`,
required 2FA/account settings, and readiness to create an unscoped public package. Share only
the readiness confirmation. Recheck the explicit public registry immediately before external
work; an `E404` is current visibility, not a reservation or proof of publication authority.

The human must explicitly authorize the manifest's exact commit, intended tag,
package/version, three hashes, and the named actions: tag push, draft GitHub release creation
and attachment, and human npm publication. Any mismatch or changed file requires a new clean
build, complete supplied-file verification, manifest, and authorization—not a repack.

## 3. Apply the approved tag and create only a draft release

Use a fresh narrow context that reads the approved manifest rather than general repository or
review text. Confirm the current external state still matches. Create and push `v1.0.0` only at
the manifest commit.

Immediately before attaching the retained tarball, run the read-only checker:

```sh
node scripts/verify-package.mjs \
  --check-manifest /absolute/owned/release-directory/release-manifest.json
```

The checker recomputes SHA-256, npm shasum, npm integrity, and size from current raw bytes. On
equality, create a draft GitHub release for only the approved tag and attach only that file.
Public release notes/checksum data may include the filename and hashes but must omit the private
absolute path. Leave the release draft. Do not repack.

## 4. Human npm publication of the already-tested file

In the already-confirmed private terminal, immediately recompute and compare all three hashes
again. Publish only the exact absolute tarball path recorded by the manifest. Do not expose the
path, checksum command output, auth output, credentials, `.npmrc`, or OTP in chat or repository
state. A mismatch stops and returns to a fresh build, full verification, manifest, and
authorization.

The agent does not run `npm publish`, request a credential, or add a publishing workflow.

## 5. Isolated public verification

Keep the GitHub release draft. Create a fresh empty npm cache and isolated empty user-config,
then explicitly select `https://registry.npmjs.org/` for both metadata and install checks.
Verify `skillfoo@1.0.0` metadata, shasum, and integrity against the manifest. Install the exact
version in another empty project and repeat the installed-shim version, semantic help, schema
2, deterministic ordering, stream, registry diagnostic, cache-identity, no-mutation, and exit
`0`/`1`/`2`/`3` checks.

Report the exact still-draft GitHub release database/node identifier and URL, tag/artifact/
manifest equality, and public-registry results. Stop again.

## 6. Publish only the separately authorized draft

The human must separately authorize public publication of that exact draft identifier and URL.
In another fresh narrow context, recheck that the draft identifier, tag, attached artifact, and
manifest identities remain unchanged. Publish only that draft and report its final URL. Any
mismatch leaves it unpublished and stops; it never triggers a repack, asset replacement, tag
change, or second npm upload.
