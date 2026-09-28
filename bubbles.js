/* =============================================================================================================
	AI Tray Chat — chat bubbles
================================================================================================================
	Widget factories for the chat popup: message bubbles, code blocks, rich content,
	welcome hint and the collapsible thought-process block.

	Copyright (c) 2026, Mehdi
	This work is distributed under GPLv3, see LICENSE for more information.
============================================================================================================= */

import St from "gi://St";
import Clutter from "gi://Clutter";

// Small round header button
export function iconButton(iconName, onClick) {
  const button = new St.Button({
    style_class: "button",
    child: new St.Icon({
      icon_name: iconName,
      style: "width: 16px; height: 16px;",
    }),
    style: "border-radius: 999px; padding: 6px; margin-left: 6px;",
    y_align: Clutter.ActorAlign.CENTER,
  });
  button.connect("clicked", onClick);
  return button;
}

// Dimmed greeting hint shown above an empty conversation
export function welcomeLabel(model) {
  return new St.Label({
    text: `Ask me anything — answers stream live from ${model}.`,
    x_align: Clutter.ActorAlign.FILL,
    style: "opacity: 0.55; margin-top: 200px;",
  });
}

// Chat row with a bubble aligned by role (user right, others left)
export function bubbleForRole(role) {
  const row = new St.BoxLayout({ vertical: false });
  const bubble = new St.BoxLayout({
    vertical: true,
    x_align:
      role === "user" ? Clutter.ActorAlign.END : Clutter.ActorAlign.START,
    style:
      role === "user"
        ? "background-color: #3584e4; padding: 9px 13px; border-radius: 16px; max-width: 336px;"
        : "background-color: rgba(255,255,255,0.10); padding: 9px 13px; border-radius: 16px; max-width: 336px;",
  });
  row.add_child(bubble);
  return { row, bubble };
}

// Wrapped plain text label
export function textLabel(text) {
  const label = new St.Label({ text });
  label.clutter_text.line_wrap = true;
  return label;
}

// Monospace block for fenced code
export function codeBlock(code) {
  const block = new St.BoxLayout({
    vertical: true,
    style:
      "background-color: rgba(0,0,0,0.35); border-radius: 8px; padding: 8px; margin-top: 6px;",
  });
  const label = new St.Label({ text: code });
  label.clutter_text.line_wrap = true;
  label.set_style("font-family: Monospace; font-size: 0.85em;");
  block.add_child(label);
  return block;
}

// Render markdown-fenced content: ``` segments become code blocks
export function richContent(text) {
  const box = new St.BoxLayout({ vertical: true });
  const segments = text.split("```");
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (i % 2 === 1) {
      // Drop the optional language tag line, then the trailing newline
      const code = segment
        .replace(/^[^\n]{1,12}\n/, "")
        .replace(/\n$/, "");
      if (code) box.add_child(codeBlock(code));
    } else {
      const plain = segment.replace(/^\n+/, "").replace(/\n+$/, "");
      if (plain) box.add_child(textLabel(plain));
    }
  }
  return box;
}

// Collapsible thought-process block with a live counter in its header
export function reasoningBlock() {
  const label = new St.Label({
    style: "font-size: 0.85em; opacity: 0.65; font-style: italic;",
  });
  label.clutter_text.line_wrap = true;
  label.visible = false;

  const headerLabel = new St.Label({
    text: "💭 Thinking…",
    style: "font-size: 0.85em; opacity: 0.7;",
  });
  const header = new St.Button({
    style_class: "button",
    child: headerLabel,
    style: "padding: 4px 8px; border-radius: 12px;",
  });

  let open = false;
  let duration = null;

  const sync = () => {
    label.visible = open;
    headerLabel.text =
      (open ? "▾ " : "▸ ") +
      (duration === null ? "Thinking…" : `Thought for ${duration}s`);
  };
  header.connect("clicked", () => {
    open = !open;
    sync();
  });

  const box = new St.BoxLayout({
    vertical: true,
    style: "margin-bottom: 6px;",
  });
  box.visible = false;
  box.add_child(header);
  box.add_child(label);

  return {
    box,
    // Reveal the block with the reasoning expanded
    start() {
      box.visible = true;
      open = true;
      sync();
    },
    append(text) {
      label.text += text;
    },
    // Record the elapsed seconds shown once collapsed
    done(seconds) {
      duration = seconds;
      sync();
    },
    get started() {
      return box.visible;
    },
  };
}
