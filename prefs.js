/* =============================================================================================================
	AI Tray Chat — preferences window
================================================================================================================
	Connection, behavior and shortcut settings backed by the extension schema.
	The key combination itself is edited via GNOME Settings > Keyboard.

	Copyright (c) 2026, Mehdi
	This work is distributed under the MIT license, see LICENSE for more information.
============================================================================================================= */

import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class AITrayChatPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings(
      "org.gnome.shell.extensions.ai-tray-chat",
    );

    const page = new Adw.PreferencesPage();
    window.add(page);

    const connectionGroup = new Adw.PreferencesGroup({
      title: "Connection",
      description: "Any OpenAI-compatible chat completions API",
    });
    page.add(connectionGroup);

    const endpointRow = new Adw.EntryRow({
      title: "API endpoint",
      show_apply_button: true,
    });
    settings.bind("endpoint", endpointRow, "text", Gio.SettingsBindFlags.DEFAULT);
    connectionGroup.add(endpointRow);

    const apiKeyRow = new Adw.PasswordEntryRow({ title: "API key" });
    settings.bind("api-key", apiKeyRow, "text", Gio.SettingsBindFlags.DEFAULT);
    connectionGroup.add(apiKeyRow);

    const modelRow = new Adw.EntryRow({ title: "Model" });
    settings.bind("model", modelRow, "text", Gio.SettingsBindFlags.DEFAULT);
    connectionGroup.add(modelRow);

    const behaviorGroup = new Adw.PreferencesGroup({ title: "Behavior" });
    page.add(behaviorGroup);

    const systemPromptRow = new Adw.EntryRow({ title: "System prompt" });
    settings.bind(
      "system-prompt",
      systemPromptRow,
      "text",
      Gio.SettingsBindFlags.DEFAULT,
    );
    behaviorGroup.add(systemPromptRow);

    const temperatureRow = new Adw.SpinRow({
      title: "Temperature",
      digits: 2,
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 2,
        step_increment: 0.05,
        value: settings.get_double("temperature"),
      }),
    });
    settings.bind(
      "temperature",
      temperatureRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    behaviorGroup.add(temperatureRow);

    const maxTokensRow = new Adw.SpinRow({
      title: "Max tokens",
      adjustment: new Gtk.Adjustment({
        lower: 64,
        upper: 65536,
        step_increment: 128,
        value: settings.get_int("max-tokens"),
      }),
    });
    settings.bind(
      "max-tokens",
      maxTokensRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    behaviorGroup.add(maxTokensRow);

    const historyDepthRow = new Adw.SpinRow({
      title: "History depth (turns)",
      adjustment: new Gtk.Adjustment({
        lower: 2,
        upper: 100,
        step_increment: 1,
        value: settings.get_int("history-depth"),
      }),
    });
    settings.bind(
      "history-depth",
      historyDepthRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    behaviorGroup.add(historyDepthRow);

    const shortcutGroup = new Adw.PreferencesGroup({ title: "Shortcut" });
    page.add(shortcutGroup);

    const shortcutRow = new Adw.SwitchRow({
      title: "Open with hotkey",
      subtitle: "Toggle the chat with the keyboard shortcut",
    });
    settings.bind(
      "use-shortcut",
      shortcutRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    shortcutGroup.add(shortcutRow);
  }
}
