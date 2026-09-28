/* =============================================================================================================
	AI Tray Chat — extension entry point
================================================================================================================
	Adds the tray indicator to the panel and wires the optional hotkey.

	Copyright (c) 2026, Mehdi
	This work is distributed under the MIT license, see LICENSE for more information.
============================================================================================================= */

import Meta from "gi://Meta";
import Shell from "gi://Shell";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { AITrayChatButton } from "./panelButton.js";

export default class AITrayChatExtension extends Extension {
  enable() {
    this.settings = this.getSettings();
    this.panel = new AITrayChatButton(this);
    Main.panel.addToStatusArea("AITrayChat", this.panel, 1, "right");
    if (this.settings.get_boolean("use-shortcut")) {
      Main.wm.addKeybinding(
        "chat-shortcut",
        this.settings,
        Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
        Shell.ActionMode.ALL,
        () => this.panel.menu.toggle(),
      );
      this._keybinding = true;
    }
  }

  disable() {
    if (this._keybinding) {
      Main.wm.removeKeybinding("chat-shortcut");
      this._keybinding = false;
    }
    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }
    this.settings = null;
  }
}
