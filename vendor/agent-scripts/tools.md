# Tools Reference

CLI tools available on Peter's machines. Use these for agentic tasks.

## bird 🐦
Twitter/X CLI for posting, replying, reading tweets.

**Location**: `bird` on PATH (Homebrew); repo `~/Projects/bird`

**Commands**:
```bash
bird tweet "<text>"                    # Post a tweet
bird reply <tweet-id-or-url> "<text>"  # Reply to a tweet
bird read <tweet-id-or-url>            # Fetch tweet content
bird replies <tweet-id-or-url>         # List replies to a tweet
bird thread <tweet-id-or-url>          # Show full conversation thread
bird search "<query>" [-n count]       # Search tweets
bird mentions [-n count]               # Find tweets mentioning @clawdbot
bird whoami                            # Show logged-in account
bird check                             # Show credential sources
```

**Auth**: Uses Firefox cookies by default. Pass `--firefox-profile <name>` to switch.

---

## sonoscli 🔊
Control Sonos speakers over local network (UPnP/SOAP).

**Location**: `sonos` on PATH (Homebrew); repo `~/Projects/sonoscli`

**Commands**:
```bash
sonos discover                         # Find speakers on network
sonos status --name "Room"             # Current playback status
sonos play/pause/stop --name "Room"    # Playback control
sonos next/prev --name "Room"          # Track navigation
sonos volume get/set --name "Room" 25  # Volume control
sonos mute get/toggle --name "Room"    # Mute control

# Grouping
sonos group status                     # Show current groups
sonos group join --name "A" --to "B"   # Join A into B's group
sonos group unjoin --name "Room"       # Make standalone
sonos group party --to "Room"          # Join all to one group

# Spotify (via SMAPI)
sonos smapi search --service "Spotify" --category tracks "query"
sonos open --name "Room" spotify:track:<id>
```

**Known issues**:
- SSDP multicast may fail; use `--ip <speaker-ip>` as fallback

---

## peekaboo 👀
Screenshot, screen inspection, and click automation.

Use the [Peekaboo skill](skills/peekaboo/SKILL.md), owned by `~/Projects/peekaboo/skills/peekaboo`. It covers binary selection, host permissions, command syntax, and verified background interaction.

---

## sweetistics 📊
Twitter/X analytics desktop app (Tauri).

**Location**: `~/Projects/sweetistics`

Use for deeper Twitter data analysis beyond what `bird` provides.

---

## oracle 🧿
Hand prompts + files to other AIs (GPT-5 Pro, etc.).

**Usage**: `npx -y @steipete/oracle --help` (run once per session to learn syntax)

---

## gh
GitHub CLI for PRs, issues, CI, releases.

**Usage**: `gh help`

When someone shares a GitHub URL, use `gh` to read it:
```bash
gh issue view <url> --comments
gh pr view <url> --comments --files
gh run list / gh run view <id>
```

---

## mcporter
MCP server launcher for browser automation, web scraping.

**Usage**: `mcporter --help` (on PATH via Homebrew)

Common servers: `iterm`, `firecrawl`, `XcodeBuildMCP`
