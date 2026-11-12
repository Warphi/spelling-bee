#!/usr/bin/env bash
# Node isn't on PATH on this NixOS box, so fetch it via nix at launch.
exec nix run nixpkgs#nodejs -- "$(dirname "$0")/server.js"
