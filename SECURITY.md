# Security policy

ChaiBot analyzes job-posting text you give it. Most of it runs entirely on your
machine; only the optional LLM proposal-polish step can send data off-device,
and only if you configure it.

## Keys and secrets

- **Never commit API keys.** Provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
  are read from environment variables and are never written to a file by the
  tool. There are no real keys anywhere in this repository.
- The default detector and the offline proposal draft need **no keys at all**.

## Where your data goes

- **Scam detection (`check`)** runs fully locally. The posting text never leaves
  your machine.
- **Offline proposal drafts** run fully locally.
- **LLM-polished proposals** are sent to whichever provider you choose:
  - `replay:…` — local cassette file, nothing leaves your machine.
  - `openai:…` — the posting excerpt and your draft are sent to OpenAI's API.
  - `anthropic:…` — the same data is sent to Anthropic's API.

Do not paste postings (or build proposals) containing other people's private
data and then send them to a remote provider. When in doubt, use the offline
or `replay` path.

## The local API

`chaibot serve` binds to `127.0.0.1` and has no authentication. It is intended
for local development only. Do not expose it to a public network.

Two mitigations reduce what an unwanted caller can do:

- Requests whose `Host` header is not `localhost`/`127.0.0.1`/`[::1]` are
  rejected with 403, which stops DNS-rebinding pages in a local browser from
  driving the API.
- The `provider` field of `POST /propose` is **disabled by default**, so a
  caller cannot spend the API keys in the server's environment or point the
  `replay` provider at arbitrary local files. Opt specific kinds in with
  `chaibot serve --providers replay,openai,anthropic`.

## No warranty / not a guarantee

ChaiBot is a heuristic decision aid, not a security guarantee. A low risk score
does not certify a posting as safe, and a high score is not proof of fraud. Use
your own judgment; the tool is provided "as is" (see LICENSE).

## Reporting a vulnerability

Please report security issues privately by email to
**mnasir.bee25seecs@seecs.edu.pk** rather than opening a public issue. After a
fix is released you are welcome to disclose publicly.
