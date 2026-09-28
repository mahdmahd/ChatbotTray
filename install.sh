#!/usr/bin/env bash
set -euo pipefail

UUID="ai-tray-chat@mahdmahd"
SCHEMA_ID="org.gnome.shell.extensions.ai-tray-chat"
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "Installing ${UUID}..."

# Compile the settings schema in place
glib-compile-schemas "${SCRIPT_PATH}/schemas"

# Install the extension files
mkdir -p "${DEST}"
cp "${SCRIPT_PATH}/metadata.json" \
   "${SCRIPT_PATH}/extension.js" \
   "${SCRIPT_PATH}/panelButton.js" \
   "${SCRIPT_PATH}/chatClient.js" \
   "${SCRIPT_PATH}/bubbles.js" \
   "${SCRIPT_PATH}/prefs.js" \
   "${DEST}/"
rm -rf "${DEST}/schemas" "${DEST}/icons"
cp -r "${SCRIPT_PATH}/schemas" "${DEST}/schemas"
cp -r "${SCRIPT_PATH}/icons" "${DEST}/icons"

# Configure the API key from the environment when provided
if [[ -n "${ARK_API_KEY:-}" ]]; then
  GSETTINGS_SCHEMA_DIR="${DEST}/schemas" \
    gsettings set "${SCHEMA_ID}" api-key "${ARK_API_KEY}" \
    && echo "API key configured."
fi

# Enable the extension when the shell already knows about it
if gnome-extensions info "${UUID}" >/dev/null 2>&1; then
  gnome-extensions enable "${UUID}" && echo "Extension enabled."
else
  echo "NOTE: The shell has not scanned the new extension yet — log out and back in (Wayland), then run:"
  echo "  gnome-extensions enable ${UUID}"
fi

echo "Installed to ${DEST}"
