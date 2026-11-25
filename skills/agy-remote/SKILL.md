---
name: agy-remote
description: View the AGY Remote Web Studio QR code, LAN connection URLs, and remote control status for accessing this Antigravity client from a mobile phone or another PC.
---

# AGY Remote (ZCode Web Studio)

When the user asks to open AGY Remote, scan a QR code to code on mobile, or connect from another PC:

1. Read `~/.gemini/antigravity/plugin_data/agy-remote/runtime.json` (or `config.json`) to check the running port, token, and LAN URLs.
2. Surface the sidecar UI panel pill `[AGY Remote](sidecar://agy-remote/remote/)` so the user can open the QR code panel directly in the right-hand Auxiliary Pane with one click.
3. Also display the LAN URL (e.g. `http://192.168.x.x:18899/?token=...`) so the user can open it directly on another PC.
