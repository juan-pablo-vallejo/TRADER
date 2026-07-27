# Development Workflow

How TRADER is developed across machines. Architecture lives in [SPEC.md](SPEC.md), the build
path in [ROADMAP.md](ROADMAP.md), and settled and open decisions in
[DECISIONS.md](DECISIONS.md).

**No machine addresses appear in this repository.** It is public and the machines are not
internet-exposed. Real hostnames and users live in your `~/.ssh/config`, which is the single
source of truth for them — this document refers to machines only by SSH alias.

## Machine roles

| Machine               | Role                                     | Why                                                                                                                                   |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Mac**               | Primary. All app development.            | React Native means iOS builds and simulators require macOS. Nothing in a Node/Next/Postgres stack is heavy enough to need offloading. |
| **Linux workstation** | Containers, database, long-running jobs. | Ample disk and RAM; runs Docker without competing with the editor. Optional — the stack runs fine on the Mac alone.                   |
| **Windows box**       | Legacy. Not part of TRADER.              | Carried over from the prior Flutter project. Kept reachable, but no TRADER work happens here.                                         |

**The Linux and Windows machines are the same physical hardware on a dual boot**, so only
one of the two is ever reachable. Booting one makes the other disappear from the network;
this is expected, not a fault.

This inverts the usual thin-client arrangement, where heavy work is pushed to a remote
box. For TRADER the Mac is the capable machine, because it is the only one that can build
the mobile client.

## Connecting

Every alias below is defined in `~/.ssh/config` and its real value in `.env.machines`.

```sh
ssh "$WORKSTATION_ALIAS"        # auto-selects LAN or VPN
ssh "$WORKSTATION_LAN_ALIAS"    # forces the LAN path
```

Address machines by a **stable name** — mDNS `.local`, or a DHCP reservation — rather
than a bare IP. Leases change when the network moves or the machine switches between
Wi-Fi and Ethernet, and a hardcoded address silently rots.

Enable **SSH agent forwarding** (`ForwardAgent yes`) for the workstation. Git operations
against GitHub then work from the remote box using the key already loaded on the Mac,
with no private key ever copied onto it.

## Where work happens

**On the Mac:**

- The Expo/React Native app, iOS simulator, and EAS builds — macOS-only.
- The Next.js web app and the tRPC backend during normal development.
- Everything, honestly, unless there is a specific reason to reach for the workstation.

**On the Linux workstation:**

- Containerized Postgres when working against a local database instead of a Neon branch.
- Long-running or repetitive jobs — bulk migrations, seed generation, load tests — that
  would otherwise tie up the Mac.
- Verifying behaviour on Linux, which is what the deployed backend runs.

**Nowhere in this repo:** secrets. Application config belongs in `.env` (gitignored,
loaded by Next.js at runtime); machine topology in `.env.machines`. Neither is committed.
Note that Next.js inlines any `NEXT_PUBLIC_`-prefixed variable into the client bundle, so
that prefix means _public_, literally.

## Git conventions

- `main` is the working branch. The project is single-maintainer; see
  [CONTRIBUTING.md](../.github/CONTRIBUTING.md).
- Commits are **SSH-signed** and should verify on GitHub.
- Imperative subject lines, matching the existing history
  (`Add canonical technical spec and decision log`).

## Machine readiness

The Mac is fully provisioned. **The Linux workstation has Docker, git and a JDK, but not
Node, pnpm or psql** — so the "run the stack on the workstation" path above is the intended
arrangement, not yet a working one. Provision that box before relying on it.

Build status and outstanding decisions are not tracked here — see
[ROADMAP.md](ROADMAP.md) for phases and status, and [DECISIONS.md](DECISIONS.md) for what is
still open.
