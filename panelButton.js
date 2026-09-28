/* =============================================================================================================
	AI Tray Chat — panel button & chat UI
================================================================================================================
	Tray indicator with a streaming chat popup: message bubbles, collapsible thought
	process, code block rendering, stop/new-chat controls and keyboard input.

	Copyright (c) 2026, Mehdi
	This work is distributed under GPLv3, see LICENSE for more information.
============================================================================================================= */

import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import St from "gi://St";
import Clutter from "gi://Clutter";

import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { ChatClient } from "./chatClient.js";
import {
  iconButton,
  welcomeLabel,
  bubbleForRole,
  textLabel,
  richContent,
  reasoningBlock,
} from "./bubbles.js";

const LOG_PREFIX = "ai-tray-chat-panel:";

// AI Tray Chat panel button
export const AITrayChatButton = GObject.registerClass(
  class AITrayChatButton extends PanelMenu.Button {
    _init(extension) {
      super._init(0.0, "AITrayChat");

      this.extension = extension;
      this.settings = extension.settings;
      this.history = [];
      this.client = new ChatClient();
      this._busy = false;
      this._assistantBubble = null;
      this._streamLabel = null;
      this._placeholder = null;
      this._reasoning = null;
      this._scrollSource = null;
      this._scrollQueued = false;

      // Tray icon
      const icon = new St.Icon({
        gicon: new Gio.FileIcon({
          file: Gio.File.new_for_path(
            extension.path + "/icons/ai-tray-chat.svg",
          ),
        }),
        style: "width: 18px; height: 18px;",
      });
      this.add_child(icon);

      // Popup layout
      const section = new PopupMenu.PopupMenuSection();
      const layout = new St.BoxLayout({
        vertical: true,
        style: "padding: 12px; width: 440px;",
      });
      section.actor.add_child(layout);
      this.menu.addMenuItem(section);

      // Header
      const header = new St.BoxLayout({
        vertical: false,
        style: "padding-bottom: 8px;",
      });
      header.add_child(
        new St.Label({
          text: "AI Chat",
          y_align: Clutter.ActorAlign.CENTER,
          style: "font-weight: bold; font-size: 1.05em;",
        }),
      );
      this._modelLabel = new St.Label({
        text: "",
        y_align: Clutter.ActorAlign.CENTER,
        style: "opacity: 0.6; font-size: 0.9em; margin-left: 8px;",
      });
      header.add_child(this._modelLabel);
      header.add_child(new St.Widget({ x_expand: true }));
      header.add_child(iconButton("view-refresh-symbolic", () => this._newChat()));
      header.add_child(
        iconButton("emblem-system-symbolic", () => this.extension.openPreferences()),
      );
      layout.add_child(header);

      // Messages area
      this._scroll = new St.ScrollView({
        style:
          "height: 460px; background-color: rgba(0,0,0,0.18); border-radius: 12px; padding: 10px;",
        overlay_scrollbars: true,
      });
      this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
      this._messages = new St.BoxLayout({
        vertical: true,
        style: "spacing: 8px;",
      });
      this._scroll.set_child(this._messages);
      layout.add_child(this._scroll);

      // Input row
      const inputRow = new St.BoxLayout({
        vertical: false,
        style: "spacing: 6px; padding-top: 8px;",
      });
      this._entry = new St.Entry({
        hint_text: "Ask anything…",
        can_focus: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style:
          "padding: 8px 12px; border-radius: 999px; background-color: rgba(255,255,255,0.08);",
      });
      inputRow.add_child(this._entry);
      this._sendIcon = new St.Icon({ icon_name: "document-send-symbolic" });
      const sendButton = new St.Button({
        style_class: "button",
        child: this._sendIcon,
        style: "border-radius: 999px; padding: 9px;",
        y_align: Clutter.ActorAlign.CENTER,
      });
      sendButton.connect("clicked", () => {
        if (this._busy) this.client.cancel();
        else this._submit();
      });
      inputRow.add_child(sendButton);
      layout.add_child(inputRow);

      // Wiring
      this.client.connect("reasoning", (client, piece) =>
        this._onReasoning(piece),
      );
      this.client.connect("content", (client, piece) =>
        this._onContent(piece),
      );
      this.client.connect("done", (client, text, cancelled) =>
        this._onDone(text, cancelled),
      );
      this.client.connect("error", (client, message) =>
        this._onError(message),
      );
      this._entry.clutter_text.connect("activate", () => this._submit());
      this.menu.connect("open-state-changed", (menu, open) => {
        if (!open) return;
        this._modelLabel.text = this.settings.get_string("model");
        this._entry.grab_key_focus();
        this._scrollToBottom();
      });

      this._addWelcome();
    }

    _addWelcome() {
      this._welcome = welcomeLabel(this.settings.get_string("model"));
      this._messages.add_child(this._welcome);
    }

    _removeWelcome() {
      if (this._welcome) {
        this._welcome.destroy();
        this._welcome = null;
      }
    }

    // Append a finished message bubble for a role ("user" / "error" / ...)
    _pushMessage(role, text) {
      const { row, bubble } = bubbleForRole(role);
      const label = textLabel(text);
      if (role === "error") label.set_style("font-size: 0.9em; color: #ff9c9c;");
      bubble.add_child(label);
      this._messages.add_child(row);
      this._scrollToBottom();
    }

    // Open a fresh assistant bubble with the streaming placeholders
    _startAssistant() {
      const { row, bubble } = bubbleForRole("assistant");
      this._assistantBubble = bubble;
      this._messages.add_child(row);
      this._reasoningText = "";
      this._thinkStart = GLib.get_monotonic_time();
      this._reasoning = reasoningBlock();
      this._assistantBubble.add_child(this._reasoning.box);
      this._streamText = "";
      this._streamLabel = textLabel("");
      this._streamLabel.visible = false;
      this._assistantBubble.add_child(this._streamLabel);
      this._placeholder = textLabel("…");
      this._assistantBubble.add_child(this._placeholder);
      this._scrollToBottom();
    }

    _onReasoning(piece) {
      if (!this._assistantBubble) return;
      this._reasoningText += piece;
      if (!this._reasoning.started) {
        this._placeholder.visible = false;
        this._reasoning.start();
      }
      this._reasoning.append(piece);
      this._scrollToBottom();
    }

    _onContent(piece) {
      if (!this._assistantBubble) return;
      if (!this._streamText.length) {
        this._placeholder.visible = false;
        if (this._reasoning.started) {
          this._reasoning.done(
            Math.max(
              1,
              Math.round((GLib.get_monotonic_time() - this._thinkStart) / 1e6),
            ),
          );
        }
      }
      this._streamText += piece;
      this._streamLabel.visible = true;
      this._streamLabel.text = this._streamText;
      this._scrollToBottom();
    }

    _onDone(text, cancelled) {
      const bubble = this._assistantBubble;
      this._assistantBubble = null;
      if (!bubble) {
        // Bubble already cleared (e.g. a new chat was started mid-request)
        this._setBusy(false);
        return;
      }
      // A cancelled request with no content yet leaves no bubble behind
      if (!text.trim() && cancelled) {
        const row = bubble.get_parent();
        row.get_parent().remove_child(row);
        this._scrollToBottom();
        this._setBusy(false);
        return;
      }
      bubble.remove_all_children();
      const reasoningText = this._reasoningText;
      if (reasoningText) {
        const block = reasoningBlock();
        block.box.visible = true;
        block.append(reasoningText);
        block.done(
          Math.max(
            1,
            Math.round((GLib.get_monotonic_time() - this._thinkStart) / 1e6),
          ),
        );
        bubble.add_child(block.box);
      }
      if (text.trim()) {
        this.history.push({ role: "assistant", content: text });
        bubble.add_child(richContent(text));
        this._trimHistory();
      }
      this._setBusy(false);
      if (this.menu.isOpen) this._entry.grab_key_focus();
      this._scrollToBottom();
    }

    _onError(message) {
      const bubble = this._assistantBubble;
      this._assistantBubble = null;
      if (bubble) {
        bubble.remove_all_children();
        const label = textLabel("⚠ " + message);
        label.set_style("font-size: 0.9em; color: #ff9c9c;");
        bubble.add_child(label);
      }
      this._setBusy(false);
    }

    _setBusy(busy) {
      this._busy = busy;
      this._sendIcon.set_icon_name(
        busy ? "media-playback-stop-symbolic" : "document-send-symbolic",
      );
    }

    _submit() {
      if (this._busy) return;
      const text = this._entry.text.trim();
      if (!text) return;
      this._entry.text = "";
      this._removeWelcome();
      this._pushMessage("user", text);
      this.history.push({ role: "user", content: text });
      this._trimHistory();
      this._startAssistant();
      this._setBusy(true);
      const messages = [];
      const system = this.settings.get_string("system-prompt");
      if (system.trim()) messages.push({ role: "system", content: system });
      messages.push(...this.history);
      this.client.send(messages, this._config());
    }

    _config() {
      return {
        endpoint: this.settings.get_string("endpoint"),
        apiKey: this.settings.get_string("api-key"),
        model: this.settings.get_string("model"),
        temperature: this.settings.get_double("temperature"),
        maxTokens: this.settings.get_int("max-tokens"),
      };
    }

    // Keep at most history-depth turns (one turn = user + assistant)
    _trimHistory() {
      const max = Math.max(2, this.settings.get_int("history-depth")) * 2;
      while (this.history.length > max) this.history.splice(0, 1);
    }

    _newChat() {
      if (this._busy) this.client.cancel();
      this.history = [];
      this._messages.remove_all_children();
      this._assistantBubble = null;
      this._streamLabel = null;
      this._placeholder = null;
      this._reasoning = null;
      this._addWelcome();
      if (this.menu.isOpen) this._entry.grab_key_focus();
    }

    // Scroll to the end on the next idle, coalescing burst updates
    _scrollToBottom() {
      if (this._scrollQueued) return;
      this._scrollQueued = true;
      this._scrollSource = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        this._scrollQueued = false;
        this._scrollSource = null;
        const adjustment = this._scroll.get_vscroll_bar().adjustment;
        adjustment.value = adjustment.upper;
        return GLib.SOURCE_REMOVE;
      });
    }

    destroy() {
      if (this._busy) this.client.cancel();
      if (this._scrollSource) GLib.source_remove(this._scrollSource);
      this._scrollSource = null;
      this._scrollQueued = false;
      super.destroy();
    }
  },
);
