# Railway deployment preparation

## Current status

The FastAPI service now has a Dockerfile and a local companion preview. It is **not ready
for public deployment**: the local identity provider uses SQLite and a development-only
email outbox, the household API is still demo-backed, and production Cognito verification,
PostgreSQL persistence/migrations, and protected household routes are not implemented yet.
The application deliberately refuses to start when Railway deployment variables are
present so local/demo endpoints cannot accidentally be exposed as a production service.

This workspace is not currently a Git checkout. Railway cannot deploy new pushes from this
directory until the project is in a GitHub repository and connected to a Railway service.

## Intended service layout

- Repository: the FamilyOS GitHub repository.
- Railway service root directory: `/services/family-agent`.
- Builder: Dockerfile detected in that directory.
- Health check: `/health`.
- Start command: supplied by `Dockerfile`; it binds to Railway's injected `PORT`.
- Auto-deploy: connect the GitHub repository and select the branch to deploy. Enable
  deployment on pushes to that branch. Keep service variables in Railway, not in Git.

Railway's dashboard is still required for the GitHub connection, branch selection, database
attachment, and secret values. Those steps are not completed by adding files to this repo.

## Before enabling a public deployment

1. Implement and test AWS Cognito sign-up, email verification, sign-in, sign-out, reset,
   token validation, and session/device revocation. The local `/v1/auth/dev-email/latest`
   endpoint must never be enabled outside a loopback-only development service.
2. Add PostgreSQL-backed household persistence and versioned migrations. Do not use Railway's
   ephemeral container filesystem or a local SQLite file as the real household store.
3. Require authenticated household ownership and server-side authorization for every
   non-demo household read or write. Keep seeded demo data isolated from real accounts.
4. Configure Railway PostgreSQL and Cognito identifiers/secrets in Railway Variables. Use
   exact allowed web origins, HTTPS-only cookies, backups, and a reviewed deletion/retention
   policy. Do not add the previously shared Bedrock key or any other secret to Git.
5. Run the local auth, cross-household authorization, migration, synchronization, and
   backup-restore tests before enabling auto-deploy for real family data.

Once a connected GitHub branch has autodeploy enabled, pushes to that branch can trigger
Railway deployments automatically. Confirm each deployment's health and logs in Railway;
the repository configuration alone cannot connect an account or guarantee a successful
production release.
