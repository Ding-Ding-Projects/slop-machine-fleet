# Open official device sign-in pages

The desktop client opens the real provider verification address in the system browser. The device code remains a separate field. The accepted authentication routes are exactly:

- `https://auth.openai.com/codex/device`
- `https://github.com/login/device`

These two routes reject queries, fragments, nondefault ports, embedded credentials and different hostnames. Arbitrary OAuth authorization routes and synthesized code-bearing links are not accepted. Existing explicit OpenAI help/platform and AWS documentation/console host permissions remain separate.

The client never logs an external URL or reflects its query into update status. A rejected link leaves the embedded application intact. Tests establish route decisions only; browser opening and actual provider authentication require separate native verification and user-owned account consent.
