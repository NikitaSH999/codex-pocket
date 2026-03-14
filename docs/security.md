# Security Notes

## Intended exposure

This project is meant for:

- local network use, or
- private overlay networks such as Tailscale

It is not configured for open internet exposure.

## Current protections

- explicit phone pairing with a PIN
- bearer token required for API and event stream access
- bridge exposes only Codex-centric APIs, not a general shell endpoint
- approval actions still flow through Codex/App Server semantics instead of bypassing them

## Known v1 limitations

- trusted-device tokens are stored in browser local storage
- pending approvals are kept in memory and disappear on bridge restart
- no second-factor or device revocation UI yet
- no TLS termination inside the bridge itself

## Recommended deployment posture

- keep the bridge behind LAN or Tailscale only
- rotate the pairing PIN when pairing a new phone
- use OS login and disk encryption on the host PC

