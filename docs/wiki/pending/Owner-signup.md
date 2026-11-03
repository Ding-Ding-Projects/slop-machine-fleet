# Create the first owner and sign in

Open the trusted HTTPS controller URL. An unclaimed controller offers username/password signup with no setup-code entry. Exactly one concurrent request can create the owner and initial session in PostgreSQL. Later claims receive HTTP 409 and should refresh the page into normal sign-in. No live owner is created by the automated tests.

Usernames are normalized and case-insensitive, while passwords are never trimmed or normalized. New passwords require 14–256 characters. Sign-in errors do not reveal whether a name or password was wrong. Origin, rate-limit, secure-cookie, no-store and authenticated CSRF protections remain.

## Existing owners

An owner created before usernames existed keeps its existing password, identity, sessions and storage scope. The explicit legacy sign-in mode remains usable. After signing in, choose a username and confirm the same password through the protected one-time adoption action. This does not reset or replace the account. Once named, use username/password sign-in. Public status does not reveal an owner name.

## Verification and deployment boundary

The dedicated local PostgreSQL fixture uses two independent service instances, verifies exactly one winning owner/session, forces initial-session failure to prove rollback, and checks migration, password-byte preservation and origin/CSRF behavior. It uses only a uniquely owned loopback container and isolated schemas, never the live controller. The production reset/deployment is a separate explicit operator action. Service startup does not delete any current data, hosting configuration or old protected file.
