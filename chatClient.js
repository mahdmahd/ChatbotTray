/* =============================================================================================================
	AI Tray Chat — chat client
================================================================================================================
	Streaming client for OpenAI-compatible chat completions APIs (libsoup 3 + server-sent events).

	Copyright (c) 2026, Mehdi
	This work is distributed under the MIT license, see LICENSE for more information.
============================================================================================================= */

import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Soup from "gi://Soup";

const LOG_PREFIX = "ai-tray-chat-client:";

// Streaming chat client emitting reasoning/content chunks as they arrive
export const ChatClient = GObject.registerClass(
  {
    Signals: {
      reasoning: { param_types: [GObject.TYPE_STRING] },
      content: { param_types: [GObject.TYPE_STRING] },
      done: {
        param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN],
      },
      error: { param_types: [GObject.TYPE_STRING] },
    },
  },
  class ChatClient extends GObject.Object {
    _init() {
      super._init();
      this._session = new Soup.Session({ timeout: 120, idle_timeout: 60 });
      this._cancellable = null;
      this._dataStream = null;
      this._active = false;
      this._cancelled = false;
      this._text = "";
      this._reasoning = "";
    }

    get busy() {
      return this._active;
    }

    // Abort the in-flight request; the pending read then resolves as a cancelled done
    cancel() {
      if (this._cancellable) this._cancellable.cancel();
    }

    // Send a chat completion request; messages is a [{role, content}] array
    send(messages, config) {
      if (this._active) return;
      this._active = true;
      this._cancelled = false;
      this._text = "";
      this._reasoning = "";
      this._cancellable = new Gio.Cancellable();

      const url = config.endpoint.replace(/\/+$/, "") + "/chat/completions";
      const body = JSON.stringify({
        model: config.model,
        messages: messages,
        stream: true,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      });

      let message;
      try {
        message = Soup.Message.new("POST", url);
      } catch (error) {
        this._fail(`Invalid endpoint URL: ${url}`);
        return;
      }
      message.request_headers.append(
        "Authorization",
        `Bearer ${config.apiKey}`,
      );
      message.set_request_body_from_bytes(
        "application/json",
        new GLib.Bytes(new TextEncoder().encode(body)),
      );

      this._session.send_async(
        message,
        GLib.PRIORITY_DEFAULT,
        this._cancellable,
        (session, result) => {
          let stream;
          try {
            stream = session.send_finish(result);
          } catch (error) {
            if (this._cancelled) return this._finish();
            return this._fail(`Connection failed: ${error.message}`);
          }
          const status = message.get_status();
          if (status !== Soup.Status.OK) {
            return this._drainError(stream, status);
          }
          const contentType =
            message.response_headers.get_one("Content-Type") || "";
          if (contentType.includes("text/event-stream")) {
            this._readEventStream(stream);
          } else {
            this._readJson(stream);
          }
        },
      );
    }

    // Consume an SSE body, one line at a time
    _readEventStream(stream) {
      this._dataStream = new Gio.DataInputStream({ base_stream: stream });
      this._pump();
    }

    _pump() {
      this._dataStream.read_line_async(
        GLib.PRIORITY_DEFAULT,
        this._cancellable,
        (stream, result) => {
          let line = null;
          try {
            const [raw] = stream.read_line_finish(result);
            if (raw) line = new TextDecoder().decode(raw);
          } catch (error) {
            if (this._cancelled) return this._finish();
            return this._fail(`Stream error: ${error.message}`);
          }
          if (line === null) return this._finish(); // EOF
          this._handleEventLine(line);
          if (this._active) this._pump();
        },
      );
    }

    _handleEventLine(line) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || !trimmed.startsWith("data:")) return;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return this._finish();
      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        return; // Skip malformed chunks
      }
      if (event.error && event.error.message) {
        return this._fail(event.error.message);
      }
      const choice = event.choices && event.choices[0];
      if (!choice) return;
      const delta = choice.delta || {};
      if (delta.reasoning_content) {
        this._reasoning += delta.reasoning_content;
        this.emit("reasoning", delta.reasoning_content);
      }
      if (delta.content) {
        this._text += delta.content;
        this.emit("content", delta.content);
      }
    }

    // Consume a regular JSON body (endpoint did not stream)
    _readJson(stream) {
      stream.read_bytes_async(
        4 * 1024 * 1024,
        GLib.PRIORITY_DEFAULT,
        this._cancellable,
        (source, result) => {
          let body;
          try {
            const bytes = source.read_bytes_finish(result);
            body = new TextDecoder().decode(bytes.get_data());
          } catch (error) {
            if (this._cancelled) return this._finish();
            return this._fail(`Read error: ${error.message}`);
          }
          try {
            const parsed = JSON.parse(body);
            if (parsed.error && parsed.error.message) {
              return this._fail(parsed.error.message);
            }
            const message =
              parsed.choices && parsed.choices[0] && parsed.choices[0].message;
            if (message && message.reasoning_content) {
              this._reasoning += message.reasoning_content;
              this.emit("reasoning", message.reasoning_content);
            }
            if (message && message.content) {
              this._text += message.content;
              this.emit("content", message.content);
            }
            this._finish();
          } catch {
            this._fail(`Unexpected response: ${body.slice(0, 200)}`);
          }
        },
      );
    }

    // Read an error response body and report a friendly message
    _drainError(stream, status) {
      stream.read_bytes_async(
        65536,
        GLib.PRIORITY_DEFAULT,
        this._cancellable,
        (source, result) => {
          let detail = "";
          try {
            const bytes = source.read_bytes_finish(result);
            if (bytes && bytes.get_size() > 0) {
              detail = new TextDecoder().decode(bytes.get_data());
            }
          } catch {
            // Body unreadable, report the status alone
          }
          this._fail(this._describeHttpError(status, detail));
        },
      );
    }

    _describeHttpError(status, body) {
      try {
        const parsed = JSON.parse(body);
        const error = parsed.error || parsed;
        if (error && error.message) {
          return `API error (HTTP ${status}): ${error.message}`;
        }
      } catch {
        // Not JSON
      }
      if (status === 401 || status === 403) {
        return "Authentication failed (HTTP " +
          status +
          ") — check the API key in Preferences.";
      }
      if (status === 404) {
        return "Not found (HTTP 404) — check the endpoint and model in Preferences.";
      }
      if (status === 429) {
        return "Rate limited (HTTP 429) — slow down or check your quota.";
      }
      return `API error (HTTP ${status})${body ? ": " + body.slice(0, 300) : ""}`;
    }

    _closeStream() {
      if (this._dataStream) {
        try {
          this._dataStream.close(null);
        } catch {
          // Already closed
        }
        this._dataStream = null;
      }
    }

    _finish() {
      if (!this._active) return;
      this._active = false;
      this._closeStream();
      this._cancellable = null;
      this.emit("done", this._text, this._cancelled);
    }

    _fail(message) {
      if (!this._active) return;
      this._active = false;
      this._closeStream();
      this._cancellable = null;
      console.warn(LOG_PREFIX, message);
      this.emit("error", message);
    }
  },
);
